import { z } from "zod";
import { registrarJobType, withTenant, obterSecret, FalhaJob } from "@partiumarrocos/db";
import { sendCloudText } from "@/lib/whatsapp/cloud-api";

/**
 * PM-CONV-06, Track E (§5E) — achado real durante a correção da
 * flakiness: um job type de teste registrado só dentro de UM arquivo
 * (`registrarJobType` chamado no topo daquele arquivo) só existe no
 * registro daquele processo/thread do Vitest. Quando o helper de drain
 * (`tests/helpers/job-queue.ts`) — corretamente, por design (fila global,
 * como produção) — reivindica em OUTRO arquivo uma job desse tipo
 * "local", `obterJobType` não encontra o tipo e o motor marca
 * DEAD_LETTER (comportamento correto e seguro do motor: nunca executa um
 * handler que não conhece — o "bug" era só o tipo não estar registrado
 * onde precisava).
 *
 * Em produção isso nunca acontece (todo worker roda o mesmo código
 * publicado, com o mesmo registro central `@/lib/jobs`). Na suíte de
 * testes, a correção equivalente é ter um registro central também para os
 * tipos que só existem para teste — TODO arquivo que participa da fila
 * compartilhada (chama `reivindicarProximoJob`/os helpers de drain) deve
 * importar este módulo, exatamente como já importam `@/lib/jobs`.
 */
registrarJobType({
  type: "teste.whatsapp_timeout_curto",
  descricao: "mesmo handler de whatsapp.enviar_mensagem, timeout curto para testar abort real",
  payloadSchema: z.object({ conversationId: z.string(), texto: z.string() }),
  timeoutMs: 150,
  maxAttempts: 3,
  backoffBaseMs: 50,
  backoffMaxMs: 500,
  priorityPadrao: 0,
  handler: async (prismaClient, ctx, payload) => {
    return withTenant(prismaClient, ctx.tenantId, async (tx) => {
      const conversation = await tx.conversation.findUniqueOrThrow({ where: { id: payload.conversationId }, include: { contact: true, account: true } });
      const accessToken = await obterSecret(prismaClient, { tenantId: ctx.tenantId, secretRef: conversation.account!.accessTokenSecretRef, actorType: "SISTEMA", actorLabel: "job-worker" });
      if (!accessToken) throw new FalhaJob("token indisponível", "RETRYABLE");
      try {
        await sendCloudText(conversation.account!.phoneNumberId, accessToken, conversation.contact.telefone ?? "", payload.texto, ctx.signal);
      } catch (err) {
        throw new FalhaJob(`falha: ${err instanceof Error ? err.message : "erro"}`, "RETRYABLE");
      }
      return { enviado: true };
    });
  },
});

registrarJobType({
  type: "teste.concorrencia_simples",
  descricao: "job trivial só para o teste de concorrência da fila",
  payloadSchema: z.object({ marcador: z.string() }),
  timeoutMs: 2000,
  maxAttempts: 1,
  backoffBaseMs: 100,
  backoffMaxMs: 100,
  priorityPadrao: 0,
  handler: async () => ({ ok: true }),
});
