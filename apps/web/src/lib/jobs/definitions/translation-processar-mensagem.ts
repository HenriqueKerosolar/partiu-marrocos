import { z } from "zod";
import { registrarJobType, withTenant, FalhaJob, preCheckCusto, registrarCostEvent } from "@partiumarrocos/db";
import { resolverProviderTraducao } from "@/lib/translation/resolve";

/**
 * Job Engine (T5) — processa uma mensagem recebida (WhatsApp ou webchat):
 * se for áudio, transcreve (Whisper) e substitui o placeholder `"[audio]"`
 * pelo texto real; em qualquer caso, detecta o idioma e traduz pro idioma
 * padrão do tenant (pt) — é o que o atendente lê. Roda assíncrono (não
 * dentro do webhook/rota pública, que precisam responder rápido).
 *
 * Silencioso (não falha o job) quando o tenant não tem provedor de IA
 * configurado — mesmo padrão fail-closed do Yalla (ai/yalla.ts:74): sem
 * chave, a mensagem fica sem tradução, mas continua visível no /inbox no
 * idioma original.
 */

const IDIOMA_PADRAO_TENANT = "pt-BR";

const payloadSchema = z.object({
  messageId: z.string().min(1),
});

registrarJobType({
  type: "translation.processar_mensagem_entrada",
  descricao: "Transcreve (se áudio) e traduz uma mensagem recebida pro idioma padrão do tenant.",
  payloadSchema,
  timeoutMs: 30_000, // Whisper + tradução podem levar bem mais que uma chamada de chat simples
  maxAttempts: 3,
  backoffBaseMs: 3_000,
  backoffMaxMs: 30_000,
  priorityPadrao: 5,
  handler: async (prisma, ctx, payload) => {
    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const message = await tx.message.findUnique({ where: { id: payload.messageId } });
      if (!message) throw new FalhaJob("mensagem não encontrada", "PERMANENTE");

      const resolvido = await resolverProviderTraducao(ctx.tenantId, "translate");
      if (!resolvido) return { traduzido: false, motivo: "tenant sem provedor de IA configurado" };
      const { provider, providerNome } = resolvido;

      let textoParaTraduzir = message.conteudo;
      let novoConteudo: string | undefined;

      if (message.mediaType === "audio" && message.mediaUrl) {
        const res = await fetch(message.mediaUrl);
        if (!res.ok) throw new FalhaJob(`falha ao baixar áudio pra transcrever: HTTP ${res.status}`, "RETRYABLE");
        const buffer = Buffer.from(await res.arrayBuffer());
        const mimeType = res.headers.get("content-type") ?? "audio/ogg";

        const preCheckStt = await preCheckCusto(prisma, {
          tenantId: ctx.tenantId,
          provider: providerNome,
          model: "whisper-1",
          operation: "translation_stt",
          agent: "translation",
          usageEstimado: {},
          actorType: "AGENTE",
          actorLabel: "translation",
        });
        if (preCheckStt.decisao === "BLOCK") return { traduzido: false, motivo: "custo de transcrição bloqueado pela política do tenant" };

        const transcricao = await provider.transcrever(buffer, mimeType);
        textoParaTraduzir = transcricao.texto;
        novoConteudo = transcricao.texto; // substitui o placeholder "[audio]" gravado pelo webhook

        await registrarCostEvent(prisma, {
          tenantId: ctx.tenantId,
          provider: providerNome,
          model: "whisper-1",
          agent: "translation",
          operation: "translation_stt",
          usage: {},
          source: "translation-job",
          custoEstimadoReservado: preCheckStt.custoEstimado,
          metadata: { messageId: message.id },
          actorType: "AGENTE",
          actorLabel: "translation",
        });
      }

      if (!textoParaTraduzir.trim()) return { traduzido: false, motivo: "sem texto pra traduzir" };

      const preCheckTraduzir = await preCheckCusto(prisma, {
        tenantId: ctx.tenantId,
        provider: providerNome,
        model: "gpt-4o-mini",
        operation: "translation_translate",
        agent: "translation",
        usageEstimado: { inputTokens: Math.ceil(textoParaTraduzir.length / 4), outputTokens: Math.ceil(textoParaTraduzir.length / 4) },
        actorType: "AGENTE",
        actorLabel: "translation",
      });
      if (preCheckTraduzir.decisao === "BLOCK") {
        if (novoConteudo) await tx.message.update({ where: { id: message.id }, data: { conteudo: novoConteudo } });
        return { traduzido: false, motivo: "custo de tradução bloqueado pela política do tenant" };
      }

      const { traducao, idiomaOrigem, inputTokens, outputTokens } = await provider.traduzir(textoParaTraduzir, IDIOMA_PADRAO_TENANT);

      await registrarCostEvent(prisma, {
        tenantId: ctx.tenantId,
        provider: providerNome,
        model: "gpt-4o-mini",
        agent: "translation",
        operation: "translation_translate",
        usage: { inputTokens, outputTokens },
        source: "translation-job",
        custoEstimadoReservado: preCheckTraduzir.custoEstimado,
        metadata: { messageId: message.id },
        actorType: "AGENTE",
        actorLabel: "translation",
      });

      await tx.message.update({
        where: { id: message.id },
        data: {
          ...(novoConteudo ? { conteudo: novoConteudo } : {}),
          detectedLanguage: idiomaOrigem,
          translatedConteudo: idiomaOrigem === IDIOMA_PADRAO_TENANT ? null : traducao,
          translatedLanguage: idiomaOrigem === IDIOMA_PADRAO_TENANT ? null : IDIOMA_PADRAO_TENANT,
        },
      });

      return { traduzido: idiomaOrigem !== IDIOMA_PADRAO_TENANT, idiomaOrigem };
    });
  },
});
