import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma, withSystem, withTenant, submeterJob, executarTool, concederCapability } from "@partiumarrocos/db";
import { processarJobAteConcluir } from "../helpers/job-queue";

/**
 * Repescagem estruturada (PM-NIGHT-RUN-01, Etapa 3, §24/§9) — Job Engine
 * (T5) real, nunca o `reengage.ts` do KeroSolar. Cobre a regra de
 * elegibilidade reavaliada NA HORA de rodar (não confia na avaliação de
 * quando foi agendado) e prova, negativamente, que o job NUNCA envia
 * mensagem sozinho (nenhuma `Message` é criada em nenhum cenário deste
 * arquivo — só `Note`/`Task` de sinalização).
 */
await import("@/lib/jobs"); // registra lead.repescar_elegibilidade
// PM-CONV-06, §5E — este arquivo participa da fila global de teste (via
// os helpers de drain), então precisa conhecer TODOS os job types que
// outros arquivos possam colocar na mesma fila — senão o motor DEAD_LETTER
// a job de outro arquivo se a reivindicar primeiro (achado real, ver
// tests/helpers/register-test-job-types.ts).
await import("../helpers/register-test-job-types");

const DIA_MS = 24 * 60 * 60 * 1000;

let tenant: { id: string };
let pipeline: { id: string };
let stageAberta: { id: string };
let stageGanho: { id: string };
let stagePerdido: { id: string };
let contact: { id: string };

function ctxYalla(leadId: string) {
  return { tenantId: tenant.id, agent: "yalla", actorType: "AGENTE" as const, actorLabel: "yalla", leadId };
}

async function criarLead(overrides: { stageId?: string; createdAt?: Date; status?: "ABERTO" | "GANHO" | "PERDIDO" } = {}) {
  return withTenant(prisma, tenant.id, (tx) =>
    tx.lead.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: overrides.stageId ?? stageAberta.id,
        status: overrides.status ?? "ABERTO",
        createdAt: overrides.createdAt ?? new Date(Date.now() - 10 * DIA_MS),
      },
    }),
  );
}

async function rodarJobDeLead(leadId: string) {
  const { job } = await submeterJob(prisma, {
    tenantId: tenant.id,
    type: "lead.repescar_elegibilidade",
    payload: { leadId },
    source: "teste",
    actorType: "SISTEMA",
  });
  // Drena a fila (global por design, T5) até a MINHA job concluir — nunca
  // assume que a próxima reivindicação é necessariamente a minha (ver
  // tests/helpers/job-queue.ts).
  return processarJobAteConcluir(prisma, job.id, tenant.id, "worker-teste-repescagem");
}

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (job repescagem teste)", slug: `job-repescar-${Date.now()}` } });
  await withTenant(prisma, tenant.id, async (tx) => {
    pipeline = await tx.pipeline.create({ data: { tenantId: tenant.id, nome: "Funil teste" } });
    stageAberta = await tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Em conversa", ordem: 0 } });
    stageGanho = await tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Ganho", ordem: 1, isWon: true } });
    stagePerdido = await tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Perdido", ordem: 2, isLost: true } });
    contact = await tx.contact.create({ data: { tenantId: tenant.id, nome: "Cliente repescagem" } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenant.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.execution.deleteMany({ where: { tenantId: tenant.id } });
    await tx.job.deleteMany({ where: { tenantId: tenant.id } });
    await tx.note.deleteMany({ where: { tenantId: tenant.id } });
    await tx.task.deleteMany({ where: { tenantId: tenant.id } });
    await tx.agentGrant.deleteMany({ where: { tenantId: tenant.id } });
  });
});

describe("lead.repescar_elegibilidade — elegível", () => {
  it("lead aberto, sem atividade há >=3 dias, sem follow-up pendente: sinaliza (Note+Task), nunca envia mensagem", async () => {
    const lead = await criarLead();

    const final = await rodarJobDeLead(lead.id);
    expect(final.status).toBe("SUCCEEDED");

    const nota = await withTenant(prisma, tenant.id, (tx) => tx.note.findFirstOrThrow({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "REPESCAGEM" } }));
    expect(nota.conteudo).toContain("Repescagem");

    const task = await withTenant(prisma, tenant.id, (tx) => tx.task.findFirstOrThrow({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "FOLLOWUP" } }));
    expect(task.concluida).toBe(false);

    const mensagens = await withTenant(prisma, tenant.id, (tx) => tx.message.findMany({ where: { tenantId: tenant.id } }));
    expect(mensagens).toHaveLength(0); // foundation: nunca compõe/envia mensagem sozinho
  });
});

describe("lead.repescar_elegibilidade — reavalia elegibilidade NA HORA de rodar, nunca confia na avaliação de quando foi agendado", () => {
  it("lead avançou para GANHO entre o agendamento e a execução: não sinaliza nada", async () => {
    const lead = await criarLead({ stageId: stageGanho.id, status: "GANHO" });
    const final = await rodarJobDeLead(lead.id);
    expect(final.status).toBe("SUCCEEDED"); // reavaliação é sucesso do job — só não é elegível

    const notas = await withTenant(prisma, tenant.id, (tx) => tx.note.findMany({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "REPESCAGEM" } }));
    expect(notas).toHaveLength(0);
  });

  it("lead foi perdido entre o agendamento e a execução: não sinaliza nada", async () => {
    const lead = await criarLead({ stageId: stagePerdido.id, status: "PERDIDO" });
    const final = await rodarJobDeLead(lead.id);
    expect(final.status).toBe("SUCCEEDED");
    const notas = await withTenant(prisma, tenant.id, (tx) => tx.note.findMany({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "REPESCAGEM" } }));
    expect(notas).toHaveLength(0);
  });

  it("lead teve atividade recente desde o agendamento (Note nova): não sinaliza nada", async () => {
    const lead = await criarLead();
    await withTenant(prisma, tenant.id, (tx) => tx.note.create({ data: { tenantId: tenant.id, leadId: lead.id, conteudo: "contato feito ontem" } }));

    const final = await rodarJobDeLead(lead.id);
    expect(final.status).toBe("SUCCEEDED");
    const notasRepescagem = await withTenant(prisma, tenant.id, (tx) => tx.note.findMany({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "REPESCAGEM" } }));
    expect(notasRepescagem).toHaveLength(0);
  });

  it("já existe follow-up pendente: não duplica tarefa", async () => {
    const lead = await criarLead();
    await withTenant(prisma, tenant.id, (tx) => tx.task.create({ data: { tenantId: tenant.id, leadId: lead.id, titulo: "follow-up já agendado", tipo: "FOLLOWUP" } }));

    const final = await rodarJobDeLead(lead.id);
    expect(final.status).toBe("SUCCEEDED");
    const tasks = await withTenant(prisma, tenant.id, (tx) => tx.task.findMany({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "FOLLOWUP" } }));
    expect(tasks).toHaveLength(1); // continua sendo só a que já existia
  });
});

describe("lead.agendar_repescagem (tool do Yalla) — só enfileira, nunca decide nem envia", () => {
  it("agenda o job com scheduledFor no futuro e registra Audit — nenhuma Note/Task criada na hora", async () => {
    const lead = await criarLead();
    await concederCapability(prisma, { tenantId: tenant.id, agent: "yalla", capability: "lead.agendar_repescagem", actorType: "SISTEMA" });

    const r = await executarTool(prisma, ctxYalla(lead.id), { toolId: "lead.agendar_repescagem", toolCallId: `tc-repescar-${Date.now()}`, input: { motivo: "cliente sumiu no meio da conversa" } });
    expect(r.status).toBe("SUCCESS");

    const job = await withTenant(prisma, tenant.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: (r.data as { jobId: string }).jobId } }));
    expect(job.type).toBe("lead.repescar_elegibilidade");
    expect(job.scheduledFor.getTime()).toBeGreaterThan(Date.now());

    const notasNaHora = await withTenant(prisma, tenant.id, (tx) => tx.note.findMany({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "REPESCAGEM" } }));
    expect(notasNaHora).toHaveLength(0); // agendar != executar

    const auditoria = await withSystem(prisma, (tx) => tx.auditLog.findFirstOrThrow({ where: { tenantId: tenant.id, entidadeId: lead.id, acao: "REPESCAGEM_AGENDADA" } }));
    expect(auditoria.resultado).toBe("ok");
  });

  it("duas chamadas no mesmo dia para o mesmo lead: idempotente, não duplica o Job", async () => {
    const lead = await criarLead();
    await concederCapability(prisma, { tenantId: tenant.id, agent: "yalla", capability: "lead.agendar_repescagem", actorType: "SISTEMA" });

    const r1 = await executarTool(prisma, ctxYalla(lead.id), { toolId: "lead.agendar_repescagem", toolCallId: `tc-idem-1-${Date.now()}`, input: { motivo: "primeira tentativa" } });
    const r2 = await executarTool(prisma, ctxYalla(lead.id), { toolId: "lead.agendar_repescagem", toolCallId: `tc-idem-2-${Date.now()}`, input: { motivo: "segunda tentativa, mesmo dia" } });
    expect(r1.status).toBe("SUCCESS");
    expect(r2.status).toBe("SUCCESS");
    expect((r2.data as { jobId: string }).jobId).toBe((r1.data as { jobId: string }).jobId);

    const jobs = await withTenant(prisma, tenant.id, (tx) => tx.job.findMany({ where: { tenantId: tenant.id, type: "lead.repescar_elegibilidade" } }));
    expect(jobs).toHaveLength(1);
  });

  it("sem grant, é FORBIDDEN — default-deny (T3)", async () => {
    const lead = await criarLead();
    const r = await executarTool(prisma, ctxYalla(lead.id), { toolId: "lead.agendar_repescagem", toolCallId: `tc-forbidden-${Date.now()}`, input: { motivo: "sem grant" } });
    expect(r.status).toBe("FORBIDDEN");
  });
});
