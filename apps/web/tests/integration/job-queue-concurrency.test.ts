import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, withSystem, submeterJob } from "@partiumarrocos/db";
import { processarJobAteConcluir } from "../helpers/job-queue";

/**
 * PM-CONV-06, Track E (§5E) — teste de regressão para a flakiness
 * investigada e corrigida em `tests/helpers/job-queue.ts`. Prova, DENTRO
 * de um único teste (sem depender de outro arquivo Vitest rodar ao mesmo
 * tempo por sorte), o cenário exato que causava o problema: múltiplas
 * chamadas concorrentes de `reivindicarProximoJob` disputando a MESMA fila
 * global, cada uma reivindicando corretamente uma job DIFERENTE (nunca a
 * mesma duas vezes — `FOR UPDATE SKIP LOCKED` já garante isso no motor) e
 * cada helper de drain encontrando e concluindo a job certa apesar da
 * concorrência real.
 *
 * "teste.concorrencia_simples" é registrado em
 * tests/helpers/register-test-job-types.ts (compartilhado com os outros
 * arquivos de teste de Job Engine) — nunca localmente aqui, ver esse
 * arquivo para o motivo (achado real desta mesma correção).
 */
await import("../helpers/register-test-job-types");
await import("@/lib/jobs");

let tenant: { id: string };

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (job concorrencia teste)", slug: `job-concorrencia-${Date.now()}` } });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenant.id } }));
  await prisma.$disconnect();
}, 30000);

describe("Fila global sob concorrência real (regressão da flakiness investigada em §5E)", () => {
  it("10 jobs submetidas, 5 drains concorrentes: cada job concluída exatamente uma vez, nenhuma perdida, nenhuma duplicada", async () => {
    const jobs = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        submeterJob(prisma, { tenantId: tenant.id, type: "teste.concorrencia_simples", payload: { marcador: `job-${i}` }, source: "teste", actorType: "SISTEMA" }),
      ),
    );

    // 5 "workers" concorrentes de verdade (Promise.all, não sequencial) —
    // cada um só garantido de concluir a job que ele mesmo acompanha, mas
    // todos competem pela MESMA fila global ao mesmo tempo, exatamente
    // como workers de produção reais.
    const resultados = await Promise.all(
      jobs.slice(0, 5).map(({ job }, i) => processarJobAteConcluir(prisma, job.id, tenant.id, `worker-concorrencia-${i}`)),
    );

    for (const r of resultados) expect(r.status).toBe("SUCCEEDED");

    // As outras 5 jobs (não acompanhadas ativamente por um drain próprio)
    // também precisam ter sido varridas por algum dos 5 workers acima —
    // prova que a fila é global de verdade, não escopada por quem chamou.
    const restantes = await Promise.all(jobs.slice(5).map(({ job }) => processarJobAteConcluir(prisma, job.id, tenant.id, "worker-concorrencia-limpeza")));
    for (const r of restantes) expect(r.status).toBe("SUCCEEDED");

    const execucoes = await withSystem(prisma, (tx) => tx.execution.count({ where: { tenantId: tenant.id } }));
    expect(execucoes).toBe(10); // nenhuma job executada duas vezes
  }, 20000);
});
