import { Prisma } from "@prisma/client";
import type { PrismaClient, Job, JobStatus, ActorType, GateCategoria } from "@prisma/client";
import { withTenant, withSystem } from "../tenant-db";
import { registrarEvento } from "../audit";
import { obterJobType } from "./registry";
import { calcularBackoffMs } from "./backoff";
import { FalhaJob, BloqueioGateNecessario, type JobExecutionContext } from "./types";

/**
 * Job/Execution Engine (T5) — motor genérico assíncrono:
 * REQUEST → JOB → QUEUE → CLAIM/LEASE → EXECUTION → SUCCESS/RETRY/FAILED/
 * DEAD_LETTER/BLOCKED → AUDIT.
 *
 * Reaproveita a infraestrutura já validada: `withTenant`/`withSystem` (Tenant
 * Core), `registrarEvento` (Audit T1), Gate de T1 (bloqueio/retomada), e o
 * mesmo padrão de reserva atômica (`INSERT...ON CONFLICT...RETURNING`) já
 * comprovado em T2 (CostUsage)/T3 (ToolCall). Claim usa
 * `SELECT...FOR UPDATE SKIP LOCKED` — dois workers concorrentes nunca
 * reivindicam a mesma linha (T5 §9, testado com concorrência real).
 *
 * O worker é sempre `withSystem` (cross-tenant por natureza — processa jobs
 * de QUALQUER tenant), mas o HANDLER de cada job roda com `ctx.tenantId`
 * vindo da própria linha do Job (nunca do payload) — mesma separação
 * contexto-confiável-vs-payload-não-confiável do Tool Broker (T5 §6).
 */

const LEASE_MARGIN_MS = 5_000; // margem sobre o timeout do handler, pra dar tempo do worker fechar a Execution antes do lease expirar por conta própria
const HEARTBEAT_RENOVACAO_MS = 30_000;
const SWEEP_BACKOFF_PADRAO_MS = 30_000; // usado só quando o job type não está mais registrado (não deveria acontecer)
/** T5-FIX §2 — um worker sem heartbeat há mais que isso é considerado "possivelmente parado" (bem mais que o intervalo de poll padrão de 1s do worker, pra tolerar GC pause/hiccup sem falso positivo). */
const WORKER_HEARTBEAT_STALE_MS = 15_000;
/**
 * Janela de retenção pra listagem em `obterSaudeFila` — `workerId` inclui
 * `process.pid` + sufixo aleatório (ver job-worker.ts), então cada reinício
 * de processo cria uma linha NOVA em `WorkerHeartbeat` que nunca é
 * sobrescrita por um worker futuro. Sem um corte de recência aqui, meses de
 * deploys/reinícios acumulariam dezenas de workers "parados" antigos,
 * poluindo a UI de `/jobs` sem nenhum valor informativo (achado do próprio
 * autor durante a revisão final desta rodada). Não é limpeza automática da
 * tabela em si (fora de escopo) — só não exibe/conta lixo histórico.
 */
const WORKER_HISTORICO_JANELA_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Submissão
// ---------------------------------------------------------------------------

export interface SubmeterJobParams {
  tenantId: string;
  type: string;
  payload: unknown;
  priority?: number;
  idempotencyKey?: string | null;
  scheduledFor?: Date;
  dependsOnJobId?: string | null;
  source: string;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export interface SubmeterJobResultado {
  job: Job;
  duplicado: boolean;
}

/**
 * Cria um Job — só se `type` estiver registrado (default-deny, T5 §7) e o
 * payload passar no schema declarado (falha cedo, nunca cria Job
 * malformado). Idempotente por `(tenantId, idempotencyKey)` quando
 * informado — o mesmo evento externo (ex.: mesma mensagem WhatsApp
 * reentregue) nunca gera dois Jobs (T5 §13, submission-level).
 */
export async function submeterJob(prisma: PrismaClient, params: SubmeterJobParams): Promise<SubmeterJobResultado> {
  const def = obterJobType(params.type);
  if (!def) throw new Error(`submeterJob: job type "${params.type}" não está registrado — default-deny.`);

  const payloadValidado = def.payloadSchema.parse(params.payload); // lança ZodError se inválido

  let duplicado = false;
  const job = await withTenant(prisma, params.tenantId, async (tx) => {
    if (params.idempotencyKey) {
      const existente = await tx.job.findUnique({ where: { tenantId_idempotencyKey: { tenantId: params.tenantId, idempotencyKey: params.idempotencyKey } } });
      if (existente) {
        duplicado = true;
        return existente;
      }
    }

    const status: JobStatus = params.dependsOnJobId ? "PENDING" : "READY";
    const novo = await tx.job.create({
      data: {
        tenantId: params.tenantId,
        type: params.type,
        payload: payloadValidado as Prisma.InputJsonValue,
        status,
        priority: params.priority ?? def.priorityPadrao,
        maxAttempts: def.maxAttempts,
        idempotencyKey: params.idempotencyKey ?? null,
        scheduledFor: params.scheduledFor ?? new Date(),
        dependsOnJobId: params.dependsOnJobId ?? null,
        source: params.source,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.userId ?? null,
      actorLabel: params.actorLabel ?? null,
      acao: "JOB_CREATED",
      entidade: "Job",
      entidadeId: novo.id,
      resultado: "ok",
      detalhe: { type: params.type, status, priority: novo.priority },
    });
    return novo;
  });

  return { job, duplicado };
}

// ---------------------------------------------------------------------------
// Sweeps de manutenção (lazy — mesma filosofia de `expirarSeVencido` do Gate
// em T1: sem cron/worker dedicado, roda no início de cada tentativa de
// claim). Todos cross-tenant por natureza (o worker serve todos os
// tenants) — usam `withSystem`, nunca `withTenant`.
// ---------------------------------------------------------------------------

/** Crash recovery (T5 §5/§27): RUNNING cujo lease venceu volta pra RETRY_WAIT (ou DEAD_LETTER se esgotou tentativas) — nunca fica RUNNING pra sempre. */
async function recuperarLeasesExpirados(prisma: PrismaClient): Promise<void> {
  await withSystem(prisma, async (tx) => {
    const expirados = await tx.job.findMany({
      where: { status: "RUNNING", leaseExpiresAt: { lt: new Date() } },
      select: { id: true, tenantId: true, type: true, attempts: true, maxAttempts: true },
    });

    for (const job of expirados) {
      const def = obterJobType(job.type);
      const limiteTentativas = def?.maxAttempts ?? job.maxAttempts;
      const podeTentarDeNovo = job.attempts < limiteTentativas;
      const novoStatus: JobStatus = podeTentarDeNovo ? "RETRY_WAIT" : "DEAD_LETTER";
      const backoffMs = def ? calcularBackoffMs(job.attempts, def.backoffBaseMs, def.backoffMaxMs) : SWEEP_BACKOFF_PADRAO_MS;

      const result = await tx.job.updateMany({
        where: { id: job.id, tenantId: job.tenantId, status: "RUNNING", leaseExpiresAt: { lt: new Date() } },
        data: {
          status: novoStatus,
          leaseOwner: null,
          leaseExpiresAt: null,
          scheduledFor: podeTentarDeNovo ? new Date(Date.now() + backoffMs) : undefined,
          lastError: "lease expirado — worker não deu heartbeat a tempo (crash recovery)",
        },
      });
      if (result.count > 0) {
        // Fecha também a Execution órfã (T5 §28 — fencing): sem isso, ela
        // ficaria RUNNING para sempre, e um worker stale que mais tarde
        // tentasse concluí-la (com o mesmo workerId antigo) passaria pelo
        // `updateMany...WHERE status='RUNNING' AND workerId=...` da
        // finalização como se ainda fosse dono — TIMEOUT aqui é a
        // classificação correta (o worker nunca respondeu, é efetivamente
        // um timeout de lease, não uma resposta normal).
        await tx.execution.updateMany({
          where: { tenantId: job.tenantId, jobId: job.id, attemptNumber: job.attempts, status: "RUNNING" },
          data: { status: "TIMEOUT", finishedAt: new Date(), error: "lease expirado (crash recovery)" },
        });
        await registrarEvento(tx, {
          tenantId: job.tenantId,
          actorType: "SISTEMA",
          acao: novoStatus === "DEAD_LETTER" ? "JOB_DEAD_LETTERED" : "JOB_RETRY_SCHEDULED",
          entidade: "Job",
          entidadeId: job.id,
          resultado: "lease_expirado",
          detalhe: { type: job.type, attempts: job.attempts },
        });
      }
    }
  });
}

/** Dependência (T5 §17): A concluído → B (PENDING) vira READY; A terminou sem sucesso → B vira CANCELLED (comportamento determinístico, nunca fica pendente pra sempre). */
async function resolverDependenciasPendentes(prisma: PrismaClient): Promise<void> {
  await withSystem(prisma, async (tx) => {
    const pendentes = await tx.job.findMany({
      where: { status: "PENDING", dependsOnJobId: { not: null } },
      include: { dependsOn: { select: { status: true } } },
    });

    for (const job of pendentes) {
      if (!job.dependsOn) continue;

      if (job.dependsOn.status === "SUCCEEDED") {
        const result = await tx.job.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "READY" } });
        if (result.count > 0) {
          await registrarEvento(tx, { tenantId: job.tenantId, actorType: "SISTEMA", acao: "JOB_RESUMED", entidade: "Job", entidadeId: job.id, resultado: "dependencia_satisfeita", detalhe: { dependsOnJobId: job.dependsOnJobId } });
        }
      } else if (job.dependsOn.status === "FAILED" || job.dependsOn.status === "DEAD_LETTER" || job.dependsOn.status === "CANCELLED") {
        const result = await tx.job.updateMany({
          where: { id: job.id, status: "PENDING" },
          data: { status: "CANCELLED", blockedReason: `dependência ${job.dependsOnJobId} terminou sem sucesso (${job.dependsOn.status})` },
        });
        if (result.count > 0) {
          await registrarEvento(tx, { tenantId: job.tenantId, actorType: "SISTEMA", acao: "JOB_CANCELLED", entidade: "Job", entidadeId: job.id, resultado: "dependencia_falhou", detalhe: { dependsOnJobId: job.dependsOnJobId, statusDependencia: job.dependsOn.status } });
        }
      }
    }
  });
}

/** Gate (T5 §18/§19): BLOCKED com Gate aprovado retoma pro `resumeState`; rejeitado/expirado vira CANCELLED — nunca fica bloqueado pra sempre sem decisão. */
async function resolverJobsBloqueadosPorGate(prisma: PrismaClient): Promise<void> {
  await withSystem(prisma, async (tx) => {
    const bloqueados = await tx.job.findMany({ where: { status: "BLOCKED", gateId: { not: null } } });

    for (const job of bloqueados) {
      const gate = await tx.gate.findUnique({ where: { id: job.gateId! } });
      if (!gate) continue;

      if (gate.status === "APROVADO") {
        const novoStatus = job.resumeState ?? "READY";
        const result = await tx.job.updateMany({ where: { id: job.id, status: "BLOCKED" }, data: { status: novoStatus, blockedReason: null, gateId: null, resumeState: null } });
        if (result.count > 0) {
          await registrarEvento(tx, { tenantId: job.tenantId, actorType: "SISTEMA", acao: "JOB_RESUMED", entidade: "Job", entidadeId: job.id, resultado: "gate_aprovado", detalhe: { gateId: gate.id } });
        }
      } else if (gate.status === "REJEITADO" || gate.status === "EXPIRADO") {
        const result = await tx.job.updateMany({ where: { id: job.id, status: "BLOCKED" }, data: { status: "CANCELLED", blockedReason: `Gate ${gate.status.toLowerCase()}` } });
        if (result.count > 0) {
          await registrarEvento(tx, { tenantId: job.tenantId, actorType: "SISTEMA", acao: "JOB_CANCELLED", entidade: "Job", entidadeId: job.id, resultado: "gate_negado", detalhe: { gateId: gate.id, statusGate: gate.status } });
        }
      }
      // PENDENTE: continua esperando decisão humana, nada a fazer aqui.
    }
  });
}

/** Roda os três sweeps de manutenção — chamado no início de todo claim, nunca precisa de cron/worker dedicado. Exposto separadamente para testes. */
export async function executarSweepsDeManutencao(prisma: PrismaClient): Promise<void> {
  await recuperarLeasesExpirados(prisma);
  await resolverDependenciasPendentes(prisma);
  await resolverJobsBloqueadosPorGate(prisma);
}

// ---------------------------------------------------------------------------
// Claim atômico
// ---------------------------------------------------------------------------

/**
 * Reivindica o próximo Job elegível de QUALQUER tenant (worker é cross-
 * tenant por natureza) — `FOR UPDATE SKIP LOCKED` garante que dois workers
 * concorrentes nunca peguem a mesma linha (T5 §9, testado com Promise.all
 * real e com múltiplos workers). Ordena por prioridade efetiva (prioridade
 * + aging, T5 §16 — mesma fórmula de `backoff.ts::prioridadeEfetiva`,
 * calculada em SQL aqui pra manter o claim atômico numa única query).
 *
 * `type` desconhecido (não deveria existir — default-deny na submissão,
 * mas pode acontecer se um deploy removeu um job type ainda com filas
 * pendentes) vai direto pra DEAD_LETTER em vez de travar o worker.
 */
export async function reivindicarProximoJob(prisma: PrismaClient, workerId: string): Promise<Job | null> {
  await executarSweepsDeManutencao(prisma);

  return withSystem(prisma, async (tx) => {
    // `scheduled_for`/`created_at` são TIMESTAMP sem timezone (default do
    // Prisma), gravados com dígitos UTC — comparar direto contra `now()`
    // (timestamptz) sob um `timezone` de sessão não-UTC (aqui,
    // America/Sao_Paulo) faz o Postgres converter `now()` pro fuso da
    // sessão ANTES de descartar o offset, corrompendo a comparação (achado
    // real: a query nunca encontrava nenhum candidato, mesmo com linhas
    // óbvias prontas). `AT TIME ZONE 'UTC'` reinterpreta o valor naive como
    // UTC de verdade antes de comparar — mesma correção nos dois lugares
    // que comparam/subtraem esses campos contra `now()`.
    const candidatos = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM jobs
      WHERE status IN ('READY', 'RETRY_WAIT')
        AND (scheduled_for AT TIME ZONE 'UTC') <= now()
      ORDER BY (priority + LEAST(FLOOR(EXTRACT(EPOCH FROM (now() - (created_at AT TIME ZONE 'UTC'))) / 300), 50)) DESC, scheduled_for ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    if (candidatos.length === 0) return null;
    const alvoId = candidatos[0]!.id;

    const atual = await tx.job.findUniqueOrThrow({ where: { id: alvoId } });
    const def = obterJobType(atual.type);
    if (!def) {
      await tx.job.update({ where: { id: alvoId }, data: { status: "DEAD_LETTER", lastError: `job type "${atual.type}" não está registrado neste processo` } });
      await registrarEvento(tx, { tenantId: atual.tenantId, actorType: "SISTEMA", acao: "JOB_DEAD_LETTERED", entidade: "Job", entidadeId: alvoId, resultado: "tipo_desconhecido", detalhe: { type: atual.type } });
      return null;
    }

    const leaseExpiresAt = new Date(Date.now() + def.timeoutMs + LEASE_MARGIN_MS);
    const proximaTentativa = atual.attempts + 1;
    const claimed = await tx.job.update({
      where: { id: alvoId },
      data: { status: "RUNNING", leaseOwner: workerId, leaseExpiresAt, attempts: proximaTentativa },
    });
    await tx.execution.create({
      data: { tenantId: claimed.tenantId, jobId: claimed.id, attemptNumber: proximaTentativa, status: "RUNNING", workerId, leaseExpiresAt },
    });
    await registrarEvento(tx, {
      tenantId: claimed.tenantId,
      actorType: "SISTEMA",
      acao: "JOB_CLAIMED",
      entidade: "Job",
      entidadeId: claimed.id,
      resultado: "ok",
      detalhe: { type: claimed.type, attempt: proximaTentativa, workerId },
    });
    return claimed;
  });
}

// ---------------------------------------------------------------------------
// Heartbeat — renovação de lease com fencing (T5 §11/§28)
// ---------------------------------------------------------------------------

/**
 * Renova o lease de uma Execution RUNNING — só se `workerId` ainda for o
 * dono (`leaseOwner`). Devolve `false` quando o worker já perdeu a lease
 * (foi reassumida por outro worker após expirar) — o chamador DEVE parar
 * de tratar o job como seu (T5 §11: "worker que perdeu lease não pode
 * continuar confirmando sucesso como se ainda fosse proprietário").
 */
export async function heartbeatJob(prisma: PrismaClient, tenantId: string, jobId: string, attemptNumber: number, workerId: string): Promise<boolean> {
  const novoLeaseExpiresAt = new Date(Date.now() + HEARTBEAT_RENOVACAO_MS);
  return withSystem(prisma, async (tx) => {
    const execAtualizada = await tx.execution.updateMany({
      where: { tenantId, jobId, attemptNumber, status: "RUNNING", workerId },
      data: { heartbeatAt: new Date(), leaseExpiresAt: novoLeaseExpiresAt },
    });
    if (execAtualizada.count === 0) return false; // stale worker — não é mais dono desta Execution

    const jobAtualizado = await tx.job.updateMany({
      where: { id: jobId, tenantId, status: "RUNNING", leaseOwner: workerId },
      data: { leaseExpiresAt: novoLeaseExpiresAt },
    });
    return jobAtualizado.count > 0;
  });
}

// ---------------------------------------------------------------------------
// Execução de um Job já reivindicado
// ---------------------------------------------------------------------------

class JobTimeoutError extends Error {}

/**
 * Corre `promise` contra um prazo `ms` — e, diferente de um `Promise.race`
 * simples, também ABORTA de verdade (`controller.abort()`) quando o prazo
 * estoura (T5-FIX §1). Um handler que propagou `controller.signal`
 * (via `ctx.signal`) pra dentro de uma chamada de rede real (`fetch(url,
 * {signal})`) tem a conexão realmente fechada, não só o motor parando de
 * esperar. `promise.then(onFulfilled, onRejected)` já conta como handler
 * de rejeição anexado à promise original — mesmo que ela perca a corrida
 * contra o timeout, sua eventual rejeição (inclusive por AbortError) nunca
 * vira um unhandled rejection silencioso.
 */
function comTimeout<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const erro = new JobTimeoutError(`timeout após ${ms}ms`);
      controller.abort(erro);
      reject(erro);
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Executa o handler de um Job já reivindicado por `reivindicarProximoJob`,
 * e fecha a Execution/Job para SUCCEEDED, RETRY_WAIT, FAILED, DEAD_LETTER
 * ou BLOCKED. Todo fechamento passa por `updateMany...WHERE leaseOwner =
 * workerId AND status = 'RUNNING'` — fencing: se a lease já foi reassumida
 * (`count === 0`), este worker é stale e a função simplesmente retorna sem
 * aplicar nada (T5 §28, testado).
 *
 * Timeout (T5-FIX §1): o motor cria um `AbortController` por execução e o
 * aborta de verdade quando `timeoutMs` estoura — exposto ao handler via
 * `ctx.signal`. Um handler que propaga o sinal pra uma chamada de rede real
 * (ex.: `fetch(url, {signal})`) tem a conexão efetivamente cancelada, não
 * só o motor parando de esperar. A limitação honesta original (T3 §13)
 * permanece, mais estreita: só vale pra handlers/chamadas que não têm como
 * propagar cancelamento (ex.: uma query de banco em andamento sem suporte
 * a cancelamento).
 */
export async function executarJobReivindicado(prisma: PrismaClient, job: Job, workerId: string): Promise<void> {
  const def = obterJobType(job.type);
  if (!def) return; // já tratado no claim — não deveria chegar aqui

  await withSystem(prisma, (tx) =>
    registrarEvento(tx, { tenantId: job.tenantId, actorType: "SISTEMA", acao: "JOB_STARTED", entidade: "Job", entidadeId: job.id, resultado: "ok", detalhe: { type: job.type, attempt: job.attempts } }),
  );

  const controller = new AbortController();
  const ctx: JobExecutionContext = { tenantId: job.tenantId, jobId: job.id, attemptNumber: job.attempts, workerId, signal: controller.signal };
  const inicio = Date.now();

  type ResultadoInterno =
    | { tipo: "sucesso"; data: unknown }
    | { tipo: "bloqueio"; categoria: GateCategoria; acaoProposta: string; motivo: string }
    | { tipo: "falha"; erro: string; classificacao: "RETRYABLE" | "PERMANENTE"; timeout: boolean };

  let resultado: ResultadoInterno;
  try {
    const payload = def.payloadSchema.parse(job.payload); // revalida — defesa em profundidade
    const data = await comTimeout(Promise.resolve(def.handler(prisma, ctx, payload)), def.timeoutMs, controller);
    resultado = { tipo: "sucesso", data };
  } catch (err) {
    if (err instanceof JobTimeoutError) {
      resultado = { tipo: "falha", erro: "timeout", classificacao: "RETRYABLE", timeout: true };
    } else if (err instanceof BloqueioGateNecessario) {
      resultado = { tipo: "bloqueio", categoria: err.categoria, acaoProposta: err.acaoProposta, motivo: err.message };
    } else if (err instanceof FalhaJob) {
      resultado = { tipo: "falha", erro: err.message.slice(0, 500), classificacao: err.classificacao, timeout: false };
    } else {
      resultado = { tipo: "falha", erro: (err instanceof Error ? err.message : "erro desconhecido").slice(0, 500), classificacao: "RETRYABLE", timeout: false };
    }
  }
  const duracaoMs = Date.now() - inicio;

  await withSystem(prisma, async (tx) => {
    if (resultado.tipo === "sucesso") {
      const execFechada = await tx.execution.updateMany({
        where: { tenantId: job.tenantId, jobId: job.id, attemptNumber: job.attempts, status: "RUNNING", workerId },
        data: { status: "SUCCEEDED", finishedAt: new Date(), resultado: resultado.data as Prisma.InputJsonValue, duracaoMs },
      });
      if (execFechada.count === 0) return; // stale worker — não confirma sucesso que não é mais seu

      const jobFechado = await tx.job.updateMany({
        where: { id: job.id, status: "RUNNING", leaseOwner: workerId },
        data: { status: "SUCCEEDED", leaseOwner: null, leaseExpiresAt: null, lastError: null },
      });
      if (jobFechado.count === 0) return;
      await registrarEvento(tx, { tenantId: job.tenantId, actorType: "SISTEMA", acao: "JOB_SUCCEEDED", entidade: "Job", entidadeId: job.id, resultado: "ok", detalhe: { type: job.type, attempt: job.attempts, duracaoMs } });
      return;
    }

    if (resultado.tipo === "bloqueio") {
      const execFechada = await tx.execution.updateMany({
        where: { tenantId: job.tenantId, jobId: job.id, attemptNumber: job.attempts, status: "RUNNING", workerId },
        data: { status: "FAILED", finishedAt: new Date(), error: "bloqueado_por_gate", duracaoMs },
      });
      if (execFechada.count === 0) return;

      const gate = await tx.gate.create({
        data: {
          tenantId: job.tenantId,
          categoria: resultado.categoria,
          acaoProposta: resultado.acaoProposta,
          motivo: resultado.motivo,
          solicitanteTipo: "SISTEMA",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          metadata: { jobId: job.id, jobType: job.type },
        },
      });
      await registrarEvento(tx, { tenantId: job.tenantId, actorType: "SISTEMA", acao: "gate_requested", entidade: "Gate", entidadeId: gate.id, resultado: "pendente", detalhe: { categoria: resultado.categoria, acaoProposta: resultado.acaoProposta } });

      const jobBloqueado = await tx.job.updateMany({
        where: { id: job.id, status: "RUNNING", leaseOwner: workerId },
        data: { status: "BLOCKED", leaseOwner: null, leaseExpiresAt: null, gateId: gate.id, resumeState: "READY", blockedReason: resultado.motivo },
      });
      if (jobBloqueado.count === 0) return;
      await registrarEvento(tx, { tenantId: job.tenantId, actorType: "SISTEMA", acao: "JOB_BLOCKED", entidade: "Job", entidadeId: job.id, resultado: "aguardando_gate", detalhe: { gateId: gate.id } });
      return;
    }

    // falha
    const execFechada = await tx.execution.updateMany({
      where: { tenantId: job.tenantId, jobId: job.id, attemptNumber: job.attempts, status: "RUNNING", workerId },
      data: { status: resultado.timeout ? "TIMEOUT" : "FAILED", finishedAt: new Date(), error: resultado.erro, duracaoMs },
    });
    if (execFechada.count === 0) return;

    const podeTentarDeNovo = resultado.classificacao === "RETRYABLE" && job.attempts < job.maxAttempts;
    let novoStatus: JobStatus;
    let scheduledFor: Date | undefined;
    let acao: string;
    if (podeTentarDeNovo) {
      novoStatus = "RETRY_WAIT";
      scheduledFor = new Date(Date.now() + calcularBackoffMs(job.attempts, def.backoffBaseMs, def.backoffMaxMs));
      acao = "JOB_RETRY_SCHEDULED";
    } else if (resultado.classificacao === "PERMANENTE") {
      novoStatus = "FAILED";
      acao = "JOB_FAILED";
    } else {
      novoStatus = "DEAD_LETTER";
      acao = "JOB_DEAD_LETTERED";
    }

    const jobFechado = await tx.job.updateMany({
      where: { id: job.id, status: "RUNNING", leaseOwner: workerId },
      data: { status: novoStatus, leaseOwner: null, leaseExpiresAt: null, lastError: resultado.erro, scheduledFor },
    });
    if (jobFechado.count === 0) return;
    await registrarEvento(tx, {
      tenantId: job.tenantId,
      actorType: "SISTEMA",
      acao,
      entidade: "Job",
      entidadeId: job.id,
      resultado: novoStatus.toLowerCase(),
      detalhe: { type: job.type, attempt: job.attempts, classificacao: resultado.classificacao, timeout: resultado.timeout },
    });
  });
}

// ---------------------------------------------------------------------------
// Ações administrativas (RBAC: jobs.manage — ver apps/web)
// ---------------------------------------------------------------------------

const ESTADOS_TERMINAIS: JobStatus[] = ["SUCCEEDED", "FAILED", "DEAD_LETTER", "CANCELLED"];

export async function cancelarJob(prisma: PrismaClient, params: { tenantId: string; jobId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null }): Promise<boolean> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.job.findUnique({ where: { id: params.jobId } });
    if (!atual || ESTADOS_TERMINAIS.includes(atual.status)) return false;

    const result = await tx.job.updateMany({
      where: { id: params.jobId, tenantId: params.tenantId, status: { notIn: ESTADOS_TERMINAIS } },
      data: { status: "CANCELLED", blockedReason: "cancelado manualmente", leaseOwner: null, leaseExpiresAt: null },
    });
    if (result.count === 0) return false;
    await registrarEvento(tx, { tenantId: params.tenantId, actorType: params.actorType, userId: params.userId ?? null, actorLabel: params.actorLabel ?? null, acao: "JOB_CANCELLED", entidade: "Job", entidadeId: params.jobId, resultado: "manual", detalhe: {} });
    return true;
  });
}

/** Reenvio manual (T5 §31 "retry manual") — só a partir de FAILED/DEAD_LETTER, zera tentativas. */
export async function reenviarJobManualmente(prisma: PrismaClient, params: { tenantId: string; jobId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null }): Promise<boolean> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.job.findUnique({ where: { id: params.jobId } });
    if (!atual || (atual.status !== "FAILED" && atual.status !== "DEAD_LETTER")) return false;

    const result = await tx.job.updateMany({
      where: { id: params.jobId, tenantId: params.tenantId, status: atual.status },
      data: { status: "READY", attempts: 0, lastError: null, scheduledFor: new Date() },
    });
    if (result.count === 0) return false;
    await registrarEvento(tx, { tenantId: params.tenantId, actorType: params.actorType, userId: params.userId ?? null, actorLabel: params.actorLabel ?? null, acao: "JOB_RETRY_SCHEDULED", entidade: "Job", entidadeId: params.jobId, resultado: "manual", detalhe: {} });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Observabilidade (T5 §29) — contagens por status, para a UI mínima
// ---------------------------------------------------------------------------

export async function contarJobsPorStatus(prisma: PrismaClient, tenantId: string): Promise<Record<JobStatus, number>> {
  return withTenant(prisma, tenantId, async (tx) => {
    const grupos = await tx.job.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } });
    const base: Record<JobStatus, number> = { PENDING: 0, READY: 0, RUNNING: 0, BLOCKED: 0, RETRY_WAIT: 0, SUCCEEDED: 0, FAILED: 0, DEAD_LETTER: 0, CANCELLED: 0 };
    for (const g of grupos) base[g.status] = g._count._all;
    return base;
  });
}

export async function listarJobsRecentes(prisma: PrismaClient, tenantId: string, take = 50) {
  return withTenant(prisma, tenantId, (tx) => tx.job.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" }, take }));
}

// ---------------------------------------------------------------------------
// Worker health (T5-FIX §2) — o webhook do WhatsApp agora depende do worker
// estar rodando (T5, `whatsapp.enviar_mensagem`); sem isso, uma fila
// acumulando READY sem processar é invisível até alguém notar mensagens não
// saindo. `WorkerHeartbeat` é GLOBAL (sem tenantId/RLS, mesmo tratamento de
// ModelPrice) — um worker serve todos os tenants, não é dado de um só.
// ---------------------------------------------------------------------------

/** Chamado periodicamente pelo próprio processo worker (ver apps/web/src/scripts/job-worker.ts) — nunca por request HTTP. */
export async function registrarHeartbeatWorker(prisma: PrismaClient, workerId: string, incrementoProcessados = 0): Promise<void> {
  const agora = new Date();
  await prisma.workerHeartbeat.upsert({
    where: { workerId },
    update: { lastHeartbeatAt: agora, jobsProcessados: { increment: incrementoProcessados } },
    create: { workerId, startedAt: agora, lastHeartbeatAt: agora, jobsProcessados: incrementoProcessados },
  });
}

export interface SaudeWorker {
  workerId: string;
  startedAt: Date;
  lastHeartbeatAt: Date;
  jobsProcessados: number;
  ativo: boolean;
}

export interface SaudeFila {
  workers: SaudeWorker[];
  nenhumWorkerAtivo: boolean;
  /** Idade do Job READY mais antigo (fila acumulando) — null se não há nenhum READY agora. */
  readyMaisAntigoIdadeMs: number | null;
  contagemGlobal: { READY: number; RETRY_WAIT: number; DEAD_LETTER: number; RUNNING: number };
}

/**
 * Observabilidade mínima (T5-FIX §2, não é Command Center): worker
 * ativo/possivelmente parado, idade do Job READY mais antigo, contagens
 * globais (todos os tenants — um worker parado afeta todo mundo, não um
 * tenant só). Usado pela UI de `/jobs`.
 */
export async function obterSaudeFila(prisma: PrismaClient): Promise<SaudeFila> {
  return withSystem(prisma, async (tx) => {
    const agora = new Date();
    const workersRaw = await tx.workerHeartbeat.findMany({
      where: { lastHeartbeatAt: { gte: new Date(agora.getTime() - WORKER_HISTORICO_JANELA_MS) } },
      orderBy: { lastHeartbeatAt: "desc" },
      take: 20,
    });
    const workers: SaudeWorker[] = workersRaw.map((w) => ({
      workerId: w.workerId,
      startedAt: w.startedAt,
      lastHeartbeatAt: w.lastHeartbeatAt,
      jobsProcessados: w.jobsProcessados,
      ativo: agora.getTime() - w.lastHeartbeatAt.getTime() <= WORKER_HEARTBEAT_STALE_MS,
    }));
    const nenhumWorkerAtivo = !workers.some((w) => w.ativo);

    const maisAntigo = await tx.job.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    const readyMaisAntigoIdadeMs = maisAntigo ? agora.getTime() - maisAntigo.createdAt.getTime() : null;

    const [ready, retryWait, deadLetter, running] = await Promise.all([
      tx.job.count({ where: { status: "READY" } }),
      tx.job.count({ where: { status: "RETRY_WAIT" } }),
      tx.job.count({ where: { status: "DEAD_LETTER" } }),
      tx.job.count({ where: { status: "RUNNING" } }),
    ]);

    return { workers, nenhumWorkerAtivo, readyMaisAntigoIdadeMs, contagemGlobal: { READY: ready, RETRY_WAIT: retryWait, DEAD_LETTER: deadLetter, RUNNING: running } };
  });
}
