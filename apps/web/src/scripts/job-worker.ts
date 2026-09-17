/**
 * Worker do Job Engine (T5 §25) — processo separado da request HTTP de
 * propósito ("não depender de request aberta/browser aberto/processo web
 * específico pra garantir execução"). PostgreSQL é o próprio backend da
 * fila (sem Redis/broker externo — T5 §25 permite isso explicitamente).
 *
 * Uso: `pnpm --filter web worker` (roda continuamente; Ctrl+C para).
 * Em produção real, isto seria um processo/serviço próprio supervisionado
 * (systemd, PM2, container separado) — não escopo desta rodada decidir
 * infraestrutura de deploy.
 *
 * PROCESSOS OBRIGATÓRIOS DO DEPLOYMENT (T5-FIX §2): desde que
 * `whatsapp.enviar_mensagem` existe, o webhook do WhatsApp SÓ entrega
 * mensagens de verdade se este worker estiver rodando — ele não é mais
 * opcional. Um deployment completo precisa de:
 *   1. WEB PROCESS  (`pnpm --filter web start` — serve HTTP, inclui o
 *      webhook, que só ENFILEIRA o envio)
 *   2. JOB WORKER   (este arquivo — processa a fila, sem ele nada é
 *      enviado de verdade)
 * Os dois são processos SEPARADOS e PRECISAM rodar juntos. Ver `/jobs` na
 * UI (seção "Saúde da fila") para detectar worker parado/fila acumulando.
 */
import { prisma, reivindicarProximoJob, executarJobReivindicado, registrarHeartbeatWorker } from "@partiumarrocos/db";
import "@/lib/jobs"; // registra todos os job types desta aplicação

const WORKER_ID = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const POLL_INTERVAL_MS = 1000;
// T5-FIX §2: escreve heartbeat a cada 5s no máximo (não a cada poll de 1s,
// pra não sobrecarregar o banco só com heartbeat) — bem abaixo de
// WORKER_HEARTBEAT_STALE_MS (15s, ver engine.ts) pra dar margem de sobra
// antes de um worker saudável parecer "parado" por atraso de escrita.
const HEARTBEAT_WRITE_INTERVAL_MS = 5000;

let encerrando = false;
process.on("SIGINT", () => {
  console.log(`[job-worker ${WORKER_ID}] encerrando (SIGINT) — termina o job em andamento, se houver...`);
  encerrando = true;
});
process.on("SIGTERM", () => {
  encerrando = true;
});

async function loop(): Promise<void> {
  console.log(`[job-worker ${WORKER_ID}] iniciado`);
  await registrarHeartbeatWorker(prisma, WORKER_ID); // heartbeat imediato — não espera 5s pra aparecer como ativo
  let ultimoHeartbeatEm = Date.now();
  let jobsDesdeUltimoHeartbeat = 0;

  while (!encerrando) {
    let job = null;
    try {
      job = await reivindicarProximoJob(prisma, WORKER_ID);
    } catch (e) {
      console.error(`[job-worker ${WORKER_ID}] erro ao reivindicar job:`, e);
    }

    if (job) {
      console.log(`[job-worker ${WORKER_ID}] executando ${job.type} (${job.id}, tentativa ${job.attempts})`);
      try {
        await executarJobReivindicado(prisma, job, WORKER_ID);
      } catch (e) {
        console.error(`[job-worker ${WORKER_ID}] erro inesperado ao executar ${job.id}:`, e);
      }
      jobsDesdeUltimoHeartbeat++;
    }

    if (Date.now() - ultimoHeartbeatEm >= HEARTBEAT_WRITE_INTERVAL_MS) {
      try {
        await registrarHeartbeatWorker(prisma, WORKER_ID, jobsDesdeUltimoHeartbeat);
      } catch (e) {
        console.error(`[job-worker ${WORKER_ID}] erro ao gravar heartbeat:`, e);
      }
      ultimoHeartbeatEm = Date.now();
      jobsDesdeUltimoHeartbeat = 0;
    }

    if (job) continue; // tenta o próximo imediatamente, sem esperar o intervalo de poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  await registrarHeartbeatWorker(prisma, WORKER_ID, jobsDesdeUltimoHeartbeat).catch(() => {});
  console.log(`[job-worker ${WORKER_ID}] encerrado.`);
  await prisma.$disconnect();
}

loop().catch((err) => {
  console.error(`[job-worker ${WORKER_ID}] erro fatal:`, err);
  process.exit(1);
});
