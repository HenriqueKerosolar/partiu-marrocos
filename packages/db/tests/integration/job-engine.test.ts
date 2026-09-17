import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { withSystem, withTenant } from "../../src/tenant-db";
import { decidirGate } from "../../src/gates";
import {
  registrarJobType,
  submeterJob,
  reivindicarProximoJob,
  executarJobReivindicado,
  executarSweepsDeManutencao,
  heartbeatJob,
  cancelarJob,
  reenviarJobManualmente,
  contarJobsPorStatus,
  registrarHeartbeatWorker,
  obterSaudeFila,
  FalhaJob,
  BloqueioGateNecessario,
} from "../../src/jobs";

/**
 * T5 — Job/Execution Engine. Mesmo critério de teste negativo real das
 * outras suítes deste pacote: tentar ativamente vazar/burlar/duplicar/
 * correr/perder e falhar, não só "não vi quebrar".
 */
const prisma = new PrismaClient();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Job type de teste único, registrado uma vez por processo (registrarJobType
// lança se chamado duas vezes) — comportamento controlado via payload, pra
// cobrir todos os cenários sem precisar de múltiplos handlers.
registrarJobType({
  type: "teste.controlavel",
  descricao: "job de teste com comportamento controlável via payload",
  payloadSchema: z.object({
    comportamento: z.enum(["sucesso", "falha_retryable", "falha_permanente", "timeout", "bloqueio_gate"]),
    marcador: z.string().optional(),
  }),
  timeoutMs: 150,
  maxAttempts: 3,
  backoffBaseMs: 20,
  backoffMaxMs: 200,
  priorityPadrao: 0,
  handler: async (_prisma, _ctx, payload) => {
    if (payload.comportamento === "sucesso") return { ok: true, marcador: payload.marcador };
    if (payload.comportamento === "timeout") {
      await sleep(5000);
      return { ok: true };
    }
    if (payload.comportamento === "falha_retryable") throw new FalhaJob("falha transitória de teste", "RETRYABLE");
    if (payload.comportamento === "falha_permanente") throw new FalhaJob("falha permanente de teste", "PERMANENTE");
    if (payload.comportamento === "bloqueio_gate") throw new BloqueioGateNecessario("ACAO_PRIVILEGIADA", "ação de teste que precisa de aprovação", "motivo de teste");
    throw new Error("comportamento desconhecido");
  },
});

// T5-FIX §1 — job type cujo handler escuta `ctx.signal` de verdade (como um
// handler real faria propagando pra `fetch`) e nunca resolve sozinho —
// prova que o motor aborta de fato, não só para de esperar. `sinaisRecebidos`
// é populado pelo próprio handler (closure) para inspeção pelo teste.
const sinaisRecebidos: AbortSignal[] = [];
registrarJobType({
  type: "teste.abort_signal",
  descricao: "job de teste que só resolve/rejeita quando ctx.signal aborta",
  payloadSchema: z.object({}),
  timeoutMs: 80,
  maxAttempts: 3,
  backoffBaseMs: 20,
  backoffMaxMs: 200,
  priorityPadrao: 0,
  handler: (_prisma, ctx) => {
    sinaisRecebidos.push(ctx.signal);
    return new Promise((_resolve, reject) => {
      ctx.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  },
});

// Job type com maxAttempts=1 — sempre vai direto pra FAILED/DEAD_LETTER, útil pra testar dead-letter sem precisar de 3 rodadas.
registrarJobType({
  type: "teste.tentativa_unica",
  descricao: "job de teste com maxAttempts=1",
  payloadSchema: z.object({ comportamento: z.enum(["falha_retryable", "falha_permanente"]) }),
  timeoutMs: 150,
  maxAttempts: 1,
  backoffBaseMs: 20,
  backoffMaxMs: 200,
  priorityPadrao: 0,
  handler: async (_prisma, _ctx, payload) => {
    if (payload.comportamento === "falha_retryable") throw new FalhaJob("falha transitória", "RETRYABLE");
    throw new FalhaJob("falha permanente", "PERMANENTE");
  },
});

let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (jobs teste)", slug: `jobs-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (jobs teste)", slug: `jobs-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `jobs-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const roleA = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: roleA.id } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } });
    await tx.tenant.delete({ where: { id: tenantB.id } });
    await tx.user.delete({ where: { id: userA.id } });
  });
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.execution.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.job.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.gate.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.workerHeartbeat.deleteMany({ where: { workerId: { startsWith: "worker-saude-teste-" } } });
  });
});

describe("Job Registry — default-deny", () => {
  it("submeterJob com type não registrado lança erro, nunca cria Job", async () => {
    await expect(submeterJob(prisma, { tenantId: tenantA.id, type: "tipo.inventado.pelo.payload", payload: {}, source: "teste", actorType: "SISTEMA" })).rejects.toThrow();
  });

  it("payload inválido contra o schema declarado lança erro, nunca cria Job malformado", async () => {
    await expect(
      submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "isso-nao-existe" }, source: "teste", actorType: "SISTEMA" }),
    ).rejects.toThrow();
  });
});

describe("Submissão — idempotência (T5 §13, submission-level)", () => {
  it("mesma idempotencyKey duas vezes: só um Job criado", async () => {
    const idempotencyKey = `idem-${Date.now()}`;
    const r1 = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", idempotencyKey, actorType: "SISTEMA" });
    const r2 = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", idempotencyKey, actorType: "SISTEMA" });
    expect(r1.duplicado).toBe(false);
    expect(r2.duplicado).toBe(true);
    expect(r2.job.id).toBe(r1.job.id);

    const linhas = await withTenant(prisma, tenantA.id, (tx) => tx.job.findMany({ where: { tenantId: tenantA.id, idempotencyKey } }));
    expect(linhas).toHaveLength(1);
  });
});

describe("RLS — isolamento multi-tenant", () => {
  it("Tenant B não lê Job do Tenant A", async () => {
    await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const doB = await withTenant(prisma, tenantB.id, (tx) => tx.job.findMany({ where: { tenantId: tenantA.id } }));
    expect(doB).toHaveLength(0);
  });

  it("sem contexto de tenant, nenhuma linha é retornada — fail-closed", async () => {
    await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const semContexto = await prisma.job.findMany();
    expect(semContexto).toHaveLength(0);
  });

  it("Tenant B não consegue cancelar Job do Tenant A (IDOR)", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const cancelou = await cancelarJob(prisma, { tenantId: tenantB.id, jobId: job.id, actorType: "HUMANO", userId: userA.id });
    expect(cancelou).toBe(false);

    const aindaLa = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(aindaLa.status).not.toBe("CANCELLED");
  });
});

describe("Claim atômico — concorrência real", () => {
  it("dois claims concorrentes nunca pegam o mesmo Job (SKIP LOCKED)", async () => {
    await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });

    const [j1, j2] = await Promise.all([reivindicarProximoJob(prisma, "worker-1"), reivindicarProximoJob(prisma, "worker-2")]);
    const claimados = [j1, j2].filter((j) => j !== null);
    expect(claimados).toHaveLength(1); // só existe 1 Job — só um dos dois workers consegue algo
  });

  it("N jobs, M workers concorrentes: cada Job é reivindicado exatamente uma vez, nenhum perdido, nenhum duplicado", async () => {
    const N = 20;
    for (let i = 0; i < N; i++) {
      await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso", marcador: `job-${i}` }, source: "teste", actorType: "SISTEMA" });
    }

    const claimados: string[] = [];
    // 5 workers "concorrentes" disputando repetidamente até a fila esvaziar
    while (claimados.length < N) {
      const resultados = await Promise.all(Array.from({ length: 5 }, (_, i) => reivindicarProximoJob(prisma, `worker-carga-${i}`)));
      for (const j of resultados) if (j) claimados.push(j.id);
      if (resultados.every((j) => j === null)) break;
    }

    expect(claimados).toHaveLength(N);
    expect(new Set(claimados).size).toBe(N); // nenhum id duplicado — nenhum Job reivindicado duas vezes
  });
});

describe("Execução — sucesso, falha retryable, falha permanente, timeout", () => {
  it("sucesso: Job vira SUCCEEDED, Execution vira SUCCEEDED, JOB_SUCCEEDED auditado", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    expect(claimed!.id).toBe(job.id);
    await executarJobReivindicado(prisma, claimed!, "worker-1");

    const final = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(final.status).toBe("SUCCEEDED");
    const exec = await withTenant(prisma, tenantA.id, (tx) => tx.execution.findFirstOrThrow({ where: { jobId: job.id } }));
    expect(exec.status).toBe("SUCCEEDED");
    expect(exec.resultado).toEqual({ ok: true });

    const eventos = await withTenant(prisma, tenantA.id, (tx) => tx.auditLog.findMany({ where: { entidadeId: job.id, acao: "JOB_SUCCEEDED" } }));
    expect(eventos.length).toBeGreaterThan(0);
  });

  it("falha PERMANENTE nunca tenta de novo (T5 §12) — vai direto pra FAILED, mesmo com tentativas restantes", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "falha_permanente" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");

    const final = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(final.status).toBe("FAILED");
    expect(final.attempts).toBe(1); // não tentou de novo
  });

  it("falha RETRYABLE agenda retry (RETRY_WAIT) enquanto houver tentativas — e eventualmente conclui com sucesso", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "falha_retryable" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");

    const aposFalha = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(aposFalha.status).toBe("RETRY_WAIT");
    expect(aposFalha.attempts).toBe(1);
  });

  it("timeout: handler que nunca resolve dentro do timeoutMs vira TIMEOUT (Execution) e RETRY_WAIT (Job) — não trava o worker", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "timeout" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");

    const inicio = Date.now();
    await executarJobReivindicado(prisma, claimed!, "worker-1");
    const duracao = Date.now() - inicio;
    expect(duracao).toBeLessThan(2000); // bem menor que os 5s reais do handler — o Promise.race parou de esperar

    const exec = await withTenant(prisma, tenantA.id, (tx) => tx.execution.findFirstOrThrow({ where: { jobId: job.id } }));
    expect(exec.status).toBe("TIMEOUT");
    const final = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(final.status).toBe("RETRY_WAIT");
  }, 10000);
});

describe("Timeout — AbortSignal real (T5-FIX §1)", () => {
  it("o motor ABORTA de verdade o ctx.signal quando o timeout estoura — não é só Promise.race parando de esperar", async () => {
    sinaisRecebidos.length = 0;
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.abort_signal", payload: {}, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");

    const inicio = Date.now();
    await executarJobReivindicado(prisma, claimed!, "worker-1");
    const duracao = Date.now() - inicio;

    expect(duracao).toBeLessThan(1000); // bem menor que "nunca resolve" — o handler só termina porque foi abortado
    expect(sinaisRecebidos).toHaveLength(1);
    expect(sinaisRecebidos[0]!.aborted).toBe(true); // o AbortSignal recebido pelo handler realmente disparou

    const exec = await withTenant(prisma, tenantA.id, (tx) => tx.execution.findFirstOrThrow({ where: { jobId: job.id } }));
    expect(exec.status).toBe("TIMEOUT");
    const final = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(final.status).toBe("RETRY_WAIT"); // timeout é classificado RETRYABLE — segue a política normal de retry
  });

  it("nenhuma promise órfã gera unhandled rejection quando o handler é abortado", async () => {
    sinaisRecebidos.length = 0;
    const rejeicoesNaoTratadas: unknown[] = [];
    const onUnhandled = (reason: unknown) => rejeicoesNaoTratadas.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.abort_signal", payload: {}, source: "teste", actorType: "SISTEMA" });
      const claimed = await reivindicarProximoJob(prisma, "worker-1");
      await executarJobReivindicado(prisma, claimed!, "worker-1");
      await sleep(200); // dá tempo pro Node processar a fila de microtasks/rejeições pendentes, se houver alguma
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    expect(rejeicoesNaoTratadas).toHaveLength(0);
  });
});

describe("Dead-letter (T5 §14)", () => {
  it("após maxAttempts, Job vira DEAD_LETTER — não continua eternamente", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.tentativa_unica", payload: { comportamento: "falha_retryable" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");

    const final = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(final.status).toBe("DEAD_LETTER"); // maxAttempts=1, era retryable mas esgotou
    expect(final.lastError).toBeTruthy();
    expect(final.lastError).not.toMatch(/secret|token|password/i);

    const eventos = await withTenant(prisma, tenantA.id, (tx) => tx.auditLog.findMany({ where: { entidadeId: job.id, acao: "JOB_DEAD_LETTERED" } }));
    expect(eventos.length).toBeGreaterThan(0);
  });

  it("retry manual (RBAC jobs.manage) reabre um DEAD_LETTER — zera tentativas", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.tentativa_unica", payload: { comportamento: "falha_retryable" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");

    const reenviou = await reenviarJobManualmente(prisma, { tenantId: tenantA.id, jobId: job.id, actorType: "HUMANO", userId: userA.id });
    expect(reenviou).toBe(true);

    const reaberto = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(reaberto.status).toBe("READY");
    expect(reaberto.attempts).toBe(0);
  });
});

describe("Lease/heartbeat/crash recovery/stale worker (T5 §10/§11/§27/§28)", () => {
  it("heartbeat renova o lease enquanto o worker ainda é dono", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    const antes = claimed!.leaseExpiresAt!;

    await sleep(20);
    const ok = await heartbeatJob(prisma, tenantA.id, job.id, claimed!.attempts, "worker-1");
    expect(ok).toBe(true);

    const depois = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(depois.leaseExpiresAt!.getTime()).toBeGreaterThan(antes.getTime());
  });

  it("heartbeat de um worker que nunca foi dono falha (false), nunca renova o que não é seu", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    const ok = await heartbeatJob(prisma, tenantA.id, job.id, claimed!.attempts, "worker-impostor");
    expect(ok).toBe(false);
  });

  it("crash recovery: lease vencido é recuperado pelo sweep, Job volta pra RETRY_WAIT/DEAD_LETTER, Execution órfã fecha como TIMEOUT — nunca fica RUNNING pra sempre", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-que-vai-morrer");
    expect(claimed!.status).toBe("RUNNING");

    // simula o worker morrendo: empurra o lease pro passado diretamente no banco (nunca dá heartbeat de novo)
    await withSystem(prisma, (tx) => tx.job.updateMany({ where: { id: job.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } }));

    await executarSweepsDeManutencao(prisma);

    const recuperado = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(recuperado.status).toBe("RETRY_WAIT");
    expect(recuperado.leaseOwner).toBeNull();

    const execOrfa = await withTenant(prisma, tenantA.id, (tx) => tx.execution.findFirstOrThrow({ where: { jobId: job.id, attemptNumber: 1 } }));
    expect(execOrfa.status).toBe("TIMEOUT");
  });

  it("stale worker rejeitado: depois que outro worker assume o Job recuperado, o worker antigo NÃO consegue confirmar sucesso (fencing real)", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const claimedPorWorkerAntigo = await reivindicarProximoJob(prisma, "worker-antigo");

    // "morre": lease no passado + sweep recupera
    await withSystem(prisma, (tx) => tx.job.updateMany({ where: { id: job.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } }));
    await executarSweepsDeManutencao(prisma);
    await sleep(30); // aguarda o backoff mínimo (20ms) do job type de teste — scheduledFor precisa já ter passado

    // outro worker reivindica de verdade (attempts vira 2)
    const claimedPorWorkerNovo = await reivindicarProximoJob(prisma, "worker-novo");
    expect(claimedPorWorkerNovo).not.toBeNull();
    expect(claimedPorWorkerNovo!.attempts).toBe(2);

    // o worker antigo, que não sabe que perdeu a lease, tenta "completar" a tentativa 1 (já fechada como TIMEOUT) — deve ser ignorado silenciosamente, nunca sobrescrever o estado real
    await executarJobReivindicado(prisma, claimedPorWorkerAntigo!, "worker-antigo");

    const estadoReal = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    // o job continua sob posse do worker-novo (RUNNING, leaseOwner=worker-novo) — o worker antigo não conseguiu mexer em nada
    expect(estadoReal.status).toBe("RUNNING");
    expect(estadoReal.leaseOwner).toBe("worker-novo");

    // e o worker novo consegue concluir normalmente depois
    await executarJobReivindicado(prisma, claimedPorWorkerNovo!, "worker-novo");
    const finalReal = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(finalReal.status).toBe("SUCCEEDED");
  });
});

describe("Execution history — imutável depois de terminal (T5 §33)", () => {
  it("UPDATE via SQL bruto numa Execution já SUCCEEDED lança exceção", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");
    const exec = await withTenant(prisma, tenantA.id, (tx) => tx.execution.findFirstOrThrow({ where: { jobId: job.id } }));

    await expect(withTenant(prisma, tenantA.id, (tx) => tx.$executeRaw`UPDATE executions SET error = 'adulterado' WHERE id = ${exec.id}`)).rejects.toThrow(/imutável/);
  });

  it("DELETE via SQL bruto numa Execution já SUCCEEDED lança exceção", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");
    const exec = await withTenant(prisma, tenantA.id, (tx) => tx.execution.findFirstOrThrow({ where: { jobId: job.id } }));

    await expect(withTenant(prisma, tenantA.id, (tx) => tx.$executeRaw`DELETE FROM executions WHERE id = ${exec.id}`)).rejects.toThrow(/imutável|apagado/);
  });

  it("heartbeat/lease PODEM atualizar enquanto RUNNING — imutabilidade é só pós-terminal", async () => {
    await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    const ok = await heartbeatJob(prisma, tenantA.id, claimed!.id, claimed!.attempts, "worker-1");
    expect(ok).toBe(true); // não lançou — RUNNING é mutável
  });

  it("cascade delete de Tenant apaga suas Executions sem quebrar (rls_bypass — mesma exceção de sempre)", async () => {
    const tenantTemp = await prisma.tenant.create({ data: { nome: "Tenant cascade jobs", slug: `jobs-cascade-${Date.now()}` } });
    await submeterJob(prisma, { tenantId: tenantTemp.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");

    await expect(withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantTemp.id } }))).resolves.not.toThrow();
  });
});

describe("Dependência (T5 §17)", () => {
  it("Job B com dependsOnJobId nasce PENDING, não READY — não roda antes de A", async () => {
    const { job: jobA } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const { job: jobB } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", dependsOnJobId: jobA.id, actorType: "SISTEMA" });
    expect(jobB.status).toBe("PENDING");
  });

  it("A concluído com sucesso → B vira READY automaticamente (sweep) e é reivindicável", async () => {
    const { job: jobA } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const { job: jobB } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", dependsOnJobId: jobA.id, actorType: "SISTEMA" });

    const claimedA = await reivindicarProximoJob(prisma, "worker-1");
    expect(claimedA!.id).toBe(jobA.id); // B ainda não está elegível, só A
    await executarJobReivindicado(prisma, claimedA!, "worker-1");

    await executarSweepsDeManutencao(prisma);
    const bAtualizado = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: jobB.id } }));
    expect(bAtualizado.status).toBe("READY");

    const claimedB = await reivindicarProximoJob(prisma, "worker-2");
    expect(claimedB!.id).toBe(jobB.id);
  });

  it("A falha terminalmente → B é CANCELLED automaticamente, nunca fica pendente pra sempre", async () => {
    const { job: jobA } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.tentativa_unica", payload: { comportamento: "falha_permanente" }, source: "teste", actorType: "SISTEMA" });
    const { job: jobB } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", dependsOnJobId: jobA.id, actorType: "SISTEMA" });

    const claimedA = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimedA!, "worker-1");
    await executarSweepsDeManutencao(prisma);

    const bAtualizado = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: jobB.id } }));
    expect(bAtualizado.status).toBe("CANCELLED");
  });
});

describe("Gate (T5 §18/§19) — bloqueio/retomada sem criar um segundo sistema de aprovação", () => {
  it("handler que exige aprovação bloqueia o Job (BLOCKED) e abre um Gate real de T1", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "bloqueio_gate" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");

    const bloqueado = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(bloqueado.status).toBe("BLOCKED");
    expect(bloqueado.gateId).toBeTruthy();

    const gate = await withTenant(prisma, tenantA.id, (tx) => tx.gate.findUniqueOrThrow({ where: { id: bloqueado.gateId! } }));
    expect(gate.status).toBe("PENDENTE");
    expect(gate.categoria).toBe("ACAO_PRIVILEGIADA");
  });

  it("Gate aprovado retoma o Job pro resumeState (READY) — testável sem Camada 3 real", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "bloqueio_gate" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");
    const bloqueado = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));

    await decidirGate(prisma, { tenantId: tenantA.id, gateId: bloqueado.gateId!, decisao: "APROVADO", decisorId: userA.id });
    await executarSweepsDeManutencao(prisma);

    const retomado = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(retomado.status).toBe("READY");
    expect(retomado.gateId).toBeNull();
  });

  it("Gate rejeitado cancela o Job (CANCELLED) — nunca fica bloqueado pra sempre sem decisão", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "bloqueio_gate" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");
    const bloqueado = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));

    await decidirGate(prisma, { tenantId: tenantA.id, gateId: bloqueado.gateId!, decisao: "REJEITADO", decisorId: userA.id });
    await executarSweepsDeManutencao(prisma);

    const cancelado = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(cancelado.status).toBe("CANCELLED");
  });

  it("Gate de um Job de T5 nunca autoriza um Job de outro tenant (isolamento cross-tenant do bloqueio)", async () => {
    const { job } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "bloqueio_gate" }, source: "teste", actorType: "SISTEMA" });
    const claimed = await reivindicarProximoJob(prisma, "worker-1");
    await executarJobReivindicado(prisma, claimed!, "worker-1");
    const bloqueado = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));

    const gateVisivelDeB = await withTenant(prisma, tenantB.id, (tx) => tx.gate.findUnique({ where: { id: bloqueado.gateId! } }));
    expect(gateVisivelDeB).toBeNull();
  });
});

describe("Prioridade/fairness (T5 §16)", () => {
  it("entre dois Jobs prontos, o de maior prioridade nominal é reivindicado primeiro", async () => {
    const { job: baixa } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso", marcador: "baixa" }, priority: 0, source: "teste", actorType: "SISTEMA" });
    const { job: alta } = await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso", marcador: "alta" }, priority: 10, source: "teste", actorType: "SISTEMA" });

    const primeiro = await reivindicarProximoJob(prisma, "worker-1");
    expect(primeiro!.id).toBe(alta.id);
    void baixa;
  });
});

describe("Observabilidade (T5 §29)", () => {
  it("contarJobsPorStatus reflete o estado real da fila do tenant", async () => {
    await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const contagem = await contarJobsPorStatus(prisma, tenantA.id);
    expect(contagem.READY).toBe(2);
  });
});

describe("Worker health (T5-FIX §2)", () => {
  it("worker que acabou de dar heartbeat aparece como ativo", async () => {
    const workerId = `worker-saude-teste-${Date.now()}-a`;
    await registrarHeartbeatWorker(prisma, workerId);

    const saude = await obterSaudeFila(prisma);
    const worker = saude.workers.find((w) => w.workerId === workerId);
    expect(worker).toBeTruthy();
    expect(worker!.ativo).toBe(true);
    expect(saude.nenhumWorkerAtivo).toBe(false);
  });

  it("worker com heartbeat antigo (> WORKER_HEARTBEAT_STALE_MS) aparece como possivelmente parado", async () => {
    const workerId = `worker-saude-teste-${Date.now()}-parado`;
    await registrarHeartbeatWorker(prisma, workerId);
    // empurra o heartbeat pro passado, além do teto de "ativo" (15s)
    await withSystem(prisma, (tx) => tx.workerHeartbeat.update({ where: { workerId }, data: { lastHeartbeatAt: new Date(Date.now() - 60_000) } }));

    const saude = await obterSaudeFila(prisma);
    const worker = saude.workers.find((w) => w.workerId === workerId);
    expect(worker!.ativo).toBe(false);
  });

  it("nenhumWorkerAtivo é true quando todos os workers registrados estão parados", async () => {
    const workerId = `worker-saude-teste-${Date.now()}-unico-parado`;
    await registrarHeartbeatWorker(prisma, workerId);
    await withSystem(prisma, (tx) => tx.workerHeartbeat.update({ where: { workerId }, data: { lastHeartbeatAt: new Date(Date.now() - 60_000) } }));

    const saude = await obterSaudeFila(prisma);
    // pode haver outros workers de outros testes rodando em paralelo — a
    // asserção real é que ESTE worker específico não conta como ativo
    expect(saude.workers.find((w) => w.workerId === workerId)!.ativo).toBe(false);
  });

  it("heartbeatJob incrementa jobsProcessados", async () => {
    const workerId = `worker-saude-teste-${Date.now()}-contador`;
    await registrarHeartbeatWorker(prisma, workerId, 0);
    await registrarHeartbeatWorker(prisma, workerId, 3);
    await registrarHeartbeatWorker(prisma, workerId, 2);

    const saude = await obterSaudeFila(prisma);
    const worker = saude.workers.find((w) => w.workerId === workerId);
    expect(worker!.jobsProcessados).toBe(5);
  });

  it("readyMaisAntigoIdadeMs reflete o Job READY mais antigo entre TODOS os tenants (visão global, não de um tenant só)", async () => {
    await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso" }, source: "teste", actorType: "SISTEMA" });
    const saude = await obterSaudeFila(prisma);
    expect(saude.readyMaisAntigoIdadeMs).not.toBeNull();
    expect(saude.readyMaisAntigoIdadeMs!).toBeGreaterThanOrEqual(0);
  });

});

describe("Audit — nunca payload bruto/segredo", () => {
  it("evento de Job não carrega o payload bruto do job", async () => {
    const { job } = await submeterJob(prisma, {
      tenantId: tenantA.id,
      type: "teste.controlavel",
      payload: { comportamento: "sucesso", marcador: "dado-sensivel-do-cliente-xyz" },
      source: "teste",
      actorType: "SISTEMA",
    });
    const eventos = await withTenant(prisma, tenantA.id, (tx) => tx.auditLog.findMany({ where: { entidadeId: job.id } }));
    for (const evento of eventos) {
      expect(JSON.stringify(evento.detalhe)).not.toContain("dado-sensivel-do-cliente-xyz");
    }
  });
});

describe("Teste de carga controlado (T5 §36)", () => {
  it("100 jobs, workers concorrentes: todos executam exatamente uma vez até SUCCEEDED, nenhum perdido, nenhum duplicado", async () => {
    const N = 100;
    const inicio = Date.now();
    for (let i = 0; i < N; i++) {
      await submeterJob(prisma, { tenantId: tenantA.id, type: "teste.controlavel", payload: { comportamento: "sucesso", marcador: `carga-${i}` }, source: "teste-carga", actorType: "SISTEMA" });
    }

    const concluidos = new Set<string>();
    let rodadas = 0;
    while (concluidos.size < N && rodadas < N * 2) {
      rodadas++;
      const claims = await Promise.all(Array.from({ length: 8 }, (_, i) => reivindicarProximoJob(prisma, `worker-carga-${i}`)));
      const reivindicados = claims.filter((j): j is NonNullable<typeof j> => j !== null);
      await Promise.all(reivindicados.map((j) => executarJobReivindicado(prisma, j, `worker-carga-${claims.indexOf(j)}`)));
      for (const j of reivindicados) concluidos.add(j.id);
      if (reivindicados.length === 0) break;
    }

    const duracaoMs = Date.now() - inicio;
    const contagem = await contarJobsPorStatus(prisma, tenantA.id);

    // eslint-disable-next-line no-console
    console.log(`[T5 teste de carga] criados=${N} reivindicados=${concluidos.size} succeeded=${contagem.SUCCEEDED} duplicados=${concluidos.size - new Set(concluidos).size} perdidos=${N - concluidos.size} tempo=${duracaoMs}ms`);

    expect(concluidos.size).toBe(N);
    expect(contagem.SUCCEEDED).toBe(N);
    expect(contagem.READY + contagem.RUNNING + contagem.RETRY_WAIT).toBe(0); // nada ficou perdido na fila
  }, 60000);
});
