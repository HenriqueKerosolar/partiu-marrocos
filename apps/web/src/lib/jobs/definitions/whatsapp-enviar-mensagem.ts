import { z } from "zod";
import { registrarJobType, withTenant, obterSecret, FalhaJob } from "@partiumarrocos/db";
import { sendCloudText, CloudApiError } from "@/lib/whatsapp/cloud-api";

/**
 * Job Engine (T5) — primeiro caso real: reenvio confiável de mensagem de
 * WhatsApp. Definição vive em `apps/web` (não em `packages/db`, diferente
 * das tools de T3) porque o handler precisa do cliente HTTP da Cloud API
 * (`sendCloudText`), que é específico da aplicação — o motor genérico
 * (registry/claim/lease/retry) continua inteiramente em `packages/db`.
 *
 * Substitui o padrão anterior (chamar `sendCloudText` direto dentro do
 * webhook e só logar em caso de falha, perdendo a resposta do Yalla pra
 * sempre) — agora uma falha transitória (rede, rate limit momentâneo da
 * Meta) vira retry com backoff em vez de silenciosamente sumir.
 *
 * TIMEOUT (T5-FIX §1): `ctx.signal` é propagado pra dentro de
 * `sendCloudText` — quando o Job Engine aborta por timeout, a conexão HTTP
 * com a Graph API é realmente cancelada (`fetch(..., {signal})`), não só
 * o motor parando de esperar.
 *
 * LIMITAÇÃO HONESTA que PERMANECE mesmo com abort real (documentada no
 * relatório de fechamento): abortar a conexão local não desfaz uma
 * mensagem que a Meta já tenha recebido e processado do lado dela ANTES
 * do abort chegar — se a confirmação (resposta HTTP) se perdeu (por
 * timeout, ou por qualquer outro motivo) antes de gravarmos a Execution
 * como SUCCEEDED, um retry chama `sendCloudText` de novo e pode duplicar a
 * mensagem do lado do cliente final. Não existe idempotency key aceita
 * pela Cloud API pra texto livre que evite isso — é uma ambiguidade
 * genuinamente inerente a qualquer sistema at-least-once sobre uma API
 * externa não-idempotente, não uma lacuna deste motor. O que ESTE motor
 * garante é que o mesmo Job nunca reexecuta por conta de um bug/race
 * NOSSO (idempotencyKey na submissão + fencing de lease).
 */

const payloadSchema = z.object({
  conversationId: z.string().min(1),
  texto: z.string().min(1).max(4096),
  senderType: z.enum(["HUMANO", "IA"]),
});

registrarJobType({
  type: "whatsapp.enviar_mensagem",
  descricao: "Envia uma mensagem de texto via WhatsApp Cloud API com retry/backoff em falha transitória.",
  payloadSchema,
  timeoutMs: 15_000, // chamada de rede real — bem mais generoso que os timeouts de tool de T3 (operações de banco)
  maxAttempts: 5,
  backoffBaseMs: 2_000,
  backoffMaxMs: 60_000,
  priorityPadrao: 10, // mensagem de cliente é prioridade alta (T5 §16, exemplo dado na autorização)
  handler: async (prisma, ctx, payload) => {
    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const conversation = await tx.conversation.findUnique({ where: { id: payload.conversationId }, include: { contact: true, account: true } });
      if (!conversation) throw new FalhaJob("conversa inválida", "PERMANENTE");

      // WEBCHAT não tem API externa pra entregar — só grava a Message; o
      // widget do site já lê a resposta por polling (mesmo caminho de
      // translation-enviar-traduzido.ts para esse canal).
      if (conversation.channel === "WEBCHAT") {
        await tx.message.create({
          data: { tenantId: ctx.tenantId, conversationId: conversation.id, direction: "SAIDA", senderType: payload.senderType, conteudo: payload.texto },
        });
        await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
        return { enviado: true, canal: "WEBCHAT" as const };
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
      if (!accessToken) {
        throw new FalhaJob("não foi possível carregar o access token (SecretProvider indisponível ou credencial ausente)", "RETRYABLE");
      }

      let externalId: string | null;
      try {
        externalId = await sendCloudText(
          conversation.account.phoneNumberId,
          accessToken,
          conversation.contact.whatsappId ?? conversation.contact.telefone ?? "",
          payload.texto,
          ctx.signal,
        );
      } catch (err) {
        if (err instanceof CloudApiError && err.is24hWindow) {
          throw new FalhaJob("janela de 24h fechada — precisa de template aprovado, não é reenviável como texto livre", "PERMANENTE");
        }
        throw new FalhaJob(`falha ao enviar via Cloud API: ${err instanceof Error ? err.message : "erro desconhecido"}`, "RETRYABLE");
      }

      await tx.message.create({
        data: {
          tenantId: ctx.tenantId,
          conversationId: conversation.id,
          direction: "SAIDA",
          senderType: payload.senderType,
          conteudo: payload.texto,
          externalId,
        },
      });
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

      return { enviado: true, externalId };
    });
  },
});
