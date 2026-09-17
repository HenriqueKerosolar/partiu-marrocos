import { z } from "zod";
import { registrarJobType, submeterJob, purgarPingsAntigos, RETENCAO_PINGS_DIAS_PADRAO } from "@partiumarrocos/db";

/**
 * PM-CONV-06, §4E — `purgarPingsAntigos()` (PM-CONV-05, Track A) existia só
 * como função standalone, nunca chamada em produção. Este job type a
 * conecta de fato ao Job Engine (T5), com um padrão de RECORRÊNCIA POR
 * AUTO-RESSUBMISSÃO: como todo `Job` pertence obrigatoriamente a um tenant
 * (`Job.tenantId` não é nulo — sem "job global" no motor), não existe hoje
 * um cron cross-tenant nativo. Em vez de inventar um segundo mecanismo de
 * agendamento, o próprio handler, ao terminar com sucesso, submete a
 * PRÓXIMA execução (`scheduledFor` = +24h) para o mesmo tenant — o motor já
 * existente drena isso normalmente, sem infraestrutura nova.
 *
 * A cadeia começa em `garantirPurgaDePingsAgendada()` (chamada quando um
 * tenant começa a usar GPS de verdade — `iniciarMeuTrackingAction`, em
 * `app/actions/geolocation.ts`) e se perpetua sozinha depois disso.
 * `idempotencyKey` inclui a data do PRÓXIMO disparo — garante no máximo uma
 * purga agendada por tenant por dia, mesmo se a ação de início de tracking
 * disparar a checagem várias vezes.
 */

const payloadSchema = z.object({});

function chaveIdempotencia(tenantId: string, dataAlvo: Date): string {
  return `geo-purge-${tenantId}-${dataAlvo.toISOString().slice(0, 10)}`;
}

registrarJobType({
  type: "geolocation.purgar_pings_antigos",
  descricao: `Remove GeolocationPing com mais de ${RETENCAO_PINGS_DIAS_PADRAO} dias de sessões já FINALIZADAS, e reagenda a própria próxima execução em +24h (recorrência via auto-ressubmissão — Job Engine não tem job global cross-tenant).`,
  payloadSchema,
  timeoutMs: 30_000,
  maxAttempts: 3,
  backoffBaseMs: 60_000,
  backoffMaxMs: 15 * 60_000,
  priorityPadrao: -10, // manutenção de baixíssima prioridade — nunca compete com nada operacional
  handler: async (prisma, ctx) => {
    const removidos = await purgarPingsAntigos(prisma, ctx.tenantId);

    const proximaExecucao = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await submeterJob(prisma, {
      tenantId: ctx.tenantId,
      type: "geolocation.purgar_pings_antigos",
      payload: {},
      scheduledFor: proximaExecucao,
      idempotencyKey: chaveIdempotencia(ctx.tenantId, proximaExecucao),
      source: "job:geolocation.purgar_pings_antigos",
      actorType: "SISTEMA",
    });

    return { removidos, proximaExecucao: proximaExecucao.toISOString() };
  },
});

/**
 * Ponto de entrada da cadeia — idempotente (mesma `idempotencyKey` por
 * tenant+dia devolve o Job já existente em vez de duplicar, ver
 * `submeterJob`). Chamar sempre que um tenant começa a gerar pings de
 * verdade é suficiente: depois da primeira execução bem-sucedida, o próprio
 * handler acima mantém a cadeia viva sem depender de nenhum outro gatilho.
 */
export async function garantirPurgaDePingsAgendada(prisma: Parameters<typeof submeterJob>[0], tenantId: string): Promise<void> {
  const proximaExecucao = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await submeterJob(prisma, {
    tenantId,
    type: "geolocation.purgar_pings_antigos",
    payload: {},
    scheduledFor: proximaExecucao,
    idempotencyKey: chaveIdempotencia(tenantId, proximaExecucao),
    source: "action:iniciar_tracking",
    actorType: "SISTEMA",
  });
}
