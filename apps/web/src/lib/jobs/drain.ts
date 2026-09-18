import { prisma, reivindicarProximoJob, executarJobReivindicado } from "@partiumarrocos/db";

/**
 * Processa jobs pendentes na hora, dentro da própria requisição que acabou
 * de enfileirar um (`submeterJob`) — a Vercel (serverless) não roda o worker
 * dedicado (`pnpm --filter web worker`, ver scripts/job-worker.ts) de forma
 * contínua, então sem isto um Job ficaria parado em READY pra sempre em
 * produção. Reaproveita os mesmos primitivos do worker (claim com
 * `FOR UPDATE SKIP LOCKED` + execução com timeout/retry) — mesmo
 * comportamento, só disparado por request em vez de por um loop próprio.
 *
 * Não é substituto do worker dedicado onde ele já roda (dev local via
 * Docker) — os dois usam os mesmos primitivos e não conflitam (claim é
 * atômico). É um "melhor que nada" pro ambiente serverless: cobre o caminho
 * feliz (job criado agora, processado agora); jobs que caem em RETRY_WAIT
 * só são reprocessados na próxima vez que qualquer chamador rodar isto de
 * novo — ver o cron de segurança em api/cron/drain-jobs.
 */
const WORKER_ID_PREFIX = "inline-drain";

export async function drenarJobsPendentes(maxJobs = 5, orcamentoMs = 8_000): Promise<number> {
  const workerId = `${WORKER_ID_PREFIX}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const inicio = Date.now();
  let processados = 0;

  while (processados < maxJobs && Date.now() - inicio < orcamentoMs) {
    let job;
    try {
      job = await reivindicarProximoJob(prisma, workerId);
    } catch {
      break;
    }
    if (!job) break;

    try {
      await executarJobReivindicado(prisma, job, workerId);
    } catch {
      // executarJobReivindicado já trata falhas internamente (RETRYABLE/
      // PERMANENTE) e não deveria lançar — mas o drain nunca pode derrubar
      // a requisição que o chamou por causa de um job de terceiros.
    }
    processados++;
  }

  return processados;
}
