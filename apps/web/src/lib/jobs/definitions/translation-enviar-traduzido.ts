import { z } from "zod";
import { registrarJobType, withTenant, obterSecret, FalhaJob, preCheckCusto, registrarCostEvent } from "@partiumarrocos/db";
import { sendCloudText, sendCloudMedia, CloudApiError } from "@/lib/whatsapp/cloud-api";
import { resolverProviderTraducao } from "@/lib/translation/resolve";
import { subirMidia } from "@/lib/translation/storage";

/**
 * Job Engine (T5) — traduz e entrega a resposta do atendente (`responderWhatsapp`
 * grava a Message original e enfileira este job em vez de enviar/traduzir
 * ali mesmo, mesmo motivo de `whatsapp.enviar_mensagem`: não perder a
 * resposta numa falha transitória de rede).
 *
 * Regra de modalidade (pedido do usuário): o cliente recebe a tradução na
 * MESMA modalidade que ele usou na última mensagem — áudio se a última
 * mensagem dele foi áudio, texto se foi texto — independente de como o
 * atendente escreveu. Em WEBCHAT não há "envio" externo: o widget descobre
 * a tradução por polling na própria Message, então este job só grava
 * translatedConteudo/translatedMediaUrl e termina.
 */

const payloadSchema = z.object({
  messageId: z.string().min(1),
});

registrarJobType({
  type: "translation.enviar_traduzido",
  descricao: "Traduz a resposta do atendente pro idioma do cliente e entrega na mesma modalidade que ele usou por último.",
  payloadSchema,
  timeoutMs: 30_000,
  maxAttempts: 5,
  backoffBaseMs: 2_000,
  backoffMaxMs: 60_000,
  priorityPadrao: 10,
  handler: async (prisma, ctx, payload) => {
    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const message = await tx.message.findUnique({ where: { id: payload.messageId }, include: { conversation: { include: { contact: true, account: true } } } });
      if (!message) throw new FalhaJob("mensagem não encontrada", "PERMANENTE");
      const conversation = message.conversation;

      const ultimaEntrada = await tx.message.findFirst({
        where: { tenantId: ctx.tenantId, conversationId: conversation.id, direction: "ENTRADA" },
        orderBy: { createdAt: "desc" },
      });
      // pt-BR é o idioma padrão do tenant (atendente escreve em pt-BR) — se o
      // cliente é pt-PT, ainda assim adapta (vocabulário/gramática diferem,
      // pedido do usuário: "preciso português de portugal e português
      // brasil" como variantes distintas, não a mesma coisa).
      const idiomaCliente = ultimaEntrada?.detectedLanguage ?? "pt-BR";
      const clientePrefereAudio = ultimaEntrada?.mediaType === "audio";

      let traducao = message.conteudo;
      if (idiomaCliente !== "pt-BR") {
        const resolvido = await resolverProviderTraducao(ctx.tenantId, "translate");
        if (resolvido) {
          const preCheck = await preCheckCusto(prisma, {
            tenantId: ctx.tenantId,
            provider: resolvido.providerNome,
            model: "gpt-4o-mini",
            operation: "translation_translate",
            agent: "translation",
            usageEstimado: { inputTokens: Math.ceil(message.conteudo.length / 4), outputTokens: Math.ceil(message.conteudo.length / 4) },
            actorType: "AGENTE",
            actorLabel: "translation",
          });
          if (preCheck.decisao !== "BLOCK") {
            const resultado = await resolvido.provider.traduzir(message.conteudo, idiomaCliente);
            traducao = resultado.traducao;
            await registrarCostEvent(prisma, {
              tenantId: ctx.tenantId,
              provider: resolvido.providerNome,
              model: "gpt-4o-mini",
              agent: "translation",
              operation: "translation_translate",
              usage: { inputTokens: resultado.inputTokens, outputTokens: resultado.outputTokens },
              source: "translation-job",
              custoEstimadoReservado: preCheck.custoEstimado,
              metadata: { messageId: message.id },
              actorType: "AGENTE",
              actorLabel: "translation",
            });

            let translatedMediaUrl: string | null = null;
            let translatedMediaType: string | null = null;
            if (clientePrefereAudio) {
              const preCheckTts = await preCheckCusto(prisma, {
                tenantId: ctx.tenantId,
                provider: resolvido.providerNome,
                model: "tts-1",
                operation: "translation_tts",
                agent: "translation",
                usageEstimado: {},
                actorType: "AGENTE",
                actorLabel: "translation",
              });
              if (preCheckTts.decisao !== "BLOCK") {
                const audio = await resolvido.provider.sintetizar(traducao, idiomaCliente);
                translatedMediaUrl = await subirMidia(`translation/${message.id}.mp3`, audio.buffer, audio.mimeType);
                translatedMediaType = "audio";
                await registrarCostEvent(prisma, {
                  tenantId: ctx.tenantId,
                  provider: resolvido.providerNome,
                  model: "tts-1",
                  agent: "translation",
                  operation: "translation_tts",
                  usage: {},
                  source: "translation-job",
                  custoEstimadoReservado: preCheckTts.custoEstimado,
                  metadata: { messageId: message.id },
                  actorType: "AGENTE",
                  actorLabel: "translation",
                });
              }
            }

            await tx.message.update({
              where: { id: message.id },
              data: { translatedConteudo: traducao, translatedLanguage: idiomaCliente, translatedMediaUrl, translatedMediaType },
            });
          }
        }
      }

      if (conversation.channel === "WEBCHAT") {
        return { entregue: true, canal: "WEBCHAT" as const };
      }

      if (conversation.channel !== "WHATSAPP" || !conversation.account) {
        throw new FalhaJob("conversa sem canal de entrega suportado", "PERMANENTE");
      }

      const accessToken = await obterSecret(prisma, {
        tenantId: ctx.tenantId,
        secretRef: conversation.account.accessTokenSecretRef,
        actorType: "SISTEMA",
        actorLabel: "job-worker",
      });
      if (!accessToken) throw new FalhaJob("não foi possível carregar o access token", "RETRYABLE");

      const destino = conversation.contact.whatsappId ?? conversation.contact.telefone ?? "";
      const atualizado = await tx.message.findUnique({ where: { id: message.id } });

      let externalId: string | null;
      try {
        if (atualizado?.translatedMediaUrl && atualizado.translatedMediaType === "audio") {
          externalId = await sendCloudMedia(conversation.account.phoneNumberId, accessToken, destino, atualizado.translatedMediaUrl, "audio");
        } else {
          externalId = await sendCloudText(conversation.account.phoneNumberId, accessToken, destino, atualizado?.translatedConteudo ?? message.conteudo, ctx.signal);
        }
      } catch (err) {
        if (err instanceof CloudApiError && err.is24hWindow) {
          throw new FalhaJob("janela de 24h fechada — precisa de template aprovado", "PERMANENTE");
        }
        throw new FalhaJob(`falha ao enviar via Cloud API: ${err instanceof Error ? err.message : "erro desconhecido"}`, "RETRYABLE");
      }

      await tx.message.update({ where: { id: message.id }, data: { externalId } });
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

      return { entregue: true, canal: "WHATSAPP" as const, externalId };
    });
  },
});
