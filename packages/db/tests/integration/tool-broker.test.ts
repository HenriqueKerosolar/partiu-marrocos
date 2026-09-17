import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { withSystem, withTenant } from "../../src/tenant-db";
import { executarTool, concederCapability, revogarCapability, possuiGrant, registrarTool, defineTool } from "../../src/tools";

/**
 * T3 — Tool Broker. Mesmo critério de teste negativo real das outras
 * suítes deste pacote: tentar ativamente vazar/burlar/duplicar/correr e
 * falhar, não só "não vi quebrar".
 */
const prisma = new PrismaClient();

let tenantA: { id: string };
let tenantB: { id: string };
let pipelineA: { id: string };
let stageNovoA: { id: string; ordem: number; nome: string };
let stageContatoA: { id: string; ordem: number; nome: string };
let stageGanhoA: { id: string; ordem: number; nome: string };
let contactA: { id: string };
let leadA: { id: string };
let conversationA: { id: string };

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (tool broker teste)", slug: `tb-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (tool broker teste)", slug: `tb-b-${Date.now()}` } });

  await withTenant(prisma, tenantA.id, async (tx) => {
    pipelineA = await tx.pipeline.create({ data: { tenantId: tenantA.id, nome: "Funil teste" } });
    stageNovoA = await tx.stage.create({ data: { tenantId: tenantA.id, pipelineId: pipelineA.id, nome: "Novo", ordem: 0 } });
    stageContatoA = await tx.stage.create({ data: { tenantId: tenantA.id, pipelineId: pipelineA.id, nome: "Contato feito", ordem: 1 } });
    stageGanhoA = await tx.stage.create({ data: { tenantId: tenantA.id, pipelineId: pipelineA.id, nome: "Ganho", ordem: 2, isWon: true } });

    contactA = await tx.contact.create({ data: { tenantId: tenantA.id, nome: "Cliente Teste A" } });
    leadA = await tx.lead.create({ data: { tenantId: tenantA.id, contactId: contactA.id, pipelineId: pipelineA.id, stageId: stageNovoA.id } });
    conversationA = await tx.conversation.create({ data: { tenantId: tenantA.id, contactId: contactA.id, channel: "WEBCHAT" } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } });
    await tx.tenant.delete({ where: { id: tenantB.id } });
  });
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.toolCall.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.agentGrant.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.note.deleteMany({ where: { tenantId: tenantA.id, leadId: leadA.id } });
    await tx.task.deleteMany({ where: { tenantId: tenantA.id, leadId: leadA.id } });
    await tx.lead.update({ where: { id: leadA.id }, data: { stageId: stageNovoA.id, status: "ABERTO" } });
    await tx.contact.update({ where: { id: contactA.id }, data: { nome: "Cliente Teste A", origem: null } });
  });
});

function ctxYalla(tenantId: string, over: Partial<{ conversationId: string; contactId: string; leadId: string }> = {}) {
  return { tenantId, agent: "yalla", actorType: "AGENTE" as const, actorLabel: "yalla", conversationId: conversationA.id, contactId: contactA.id, leadId: leadA.id, ...over };
}

async function concederTudoParaYalla(tenantId: string, capabilities: string[]) {
  for (const capability of capabilities) {
    await concederCapability(prisma, { tenantId, agent: "yalla", capability, actorType: "SISTEMA" });
  }
}

describe("Tool Broker — default-deny", () => {
  it("sem NENHUM grant, qualquer tool é negada (FORBIDDEN), nenhum side effect acontece", async () => {
    const r = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "lead.consultar", toolCallId: `tc-${Date.now()}-1`, input: {} });
    expect(r.status).toBe("FORBIDDEN");
  });

  it("tool desconhecida (nome inventado pelo modelo) é NOT_FOUND, nunca tenta executar", async () => {
    const r = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "sql.executar_arbitrario", toolCallId: `tc-${Date.now()}-2`, input: { sql: "DROP TABLE leads" } });
    expect(r.status).toBe("NOT_FOUND");
  });

  it("conceder e depois revogar: revogado volta a negar", async () => {
    await concederCapability(prisma, { tenantId: tenantA.id, agent: "yalla", capability: "lead.consultar", actorType: "SISTEMA" });
    expect(await possuiGrant(prisma, tenantA.id, "yalla", "lead.consultar")).toBe(true);

    await revogarCapability(prisma, { tenantId: tenantA.id, agent: "yalla", capability: "lead.consultar", actorType: "SISTEMA" });
    expect(await possuiGrant(prisma, tenantA.id, "yalla", "lead.consultar")).toBe(false);

    const r = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "lead.consultar", toolCallId: `tc-${Date.now()}-3`, input: {} });
    expect(r.status).toBe("FORBIDDEN");
  });

  it("grant do Tenant A não autoriza o Tenant B (isolamento de grant)", async () => {
    await concederCapability(prisma, { tenantId: tenantA.id, agent: "yalla", capability: "lead.consultar", actorType: "SISTEMA" });
    expect(await possuiGrant(prisma, tenantB.id, "yalla", "lead.consultar")).toBe(false);
  });

  it("nunca existe um grant coringa — conceder uma capability específica não libera outra", async () => {
    await concederCapability(prisma, { tenantId: tenantA.id, agent: "yalla", capability: "lead.consultar", actorType: "SISTEMA" });
    const r = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "lead.mover_stage", toolCallId: `tc-${Date.now()}-4`, input: { motivo: "teste" } });
    expect(r.status).toBe("FORBIDDEN");
  });
});

describe("Tool Broker — validação de input/output", () => {
  it("input inválido (fora do schema) é VALIDATION_ERROR, nunca chega no handler", async () => {
    await concederTudoParaYalla(tenantA.id, ["tarefa.criar"]);
    const r = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "tarefa.criar", toolCallId: `tc-${Date.now()}-5`, input: { descricao: "x", motivo: "y", dataHora: "não é uma data" } });
    expect(r.status).toBe("VALIDATION_ERROR");
  });

  it("data absurda no passado é rejeitada", async () => {
    await concederTudoParaYalla(tenantA.id, ["tarefa.criar"]);
    const r = await executarTool(prisma, ctxYalla(tenantA.id), {
      toolId: "tarefa.criar",
      toolCallId: `tc-${Date.now()}-6`,
      input: { descricao: "x", motivo: "y", dataHora: "2020-01-01T00:00:00Z" },
    });
    expect(r.status).toBe("VALIDATION_ERROR");
  });

  it("payload com campo extra (mass assignment) é ignorado — só a allowlist é aplicada", async () => {
    await concederTudoParaYalla(tenantA.id, ["contato.atualizar_dados_informados"]);
    const r = await executarTool(prisma, ctxYalla(tenantA.id), {
      toolId: "contato.atualizar_dados_informados",
      toolCallId: `tc-${Date.now()}-7`,
      input: { nome: "Novo Nome", tenantId: tenantB.id, whatsappId: "hackeado", origem: "injetado" },
    });
    expect(r.status).toBe("SUCCESS");
    const contato = await withTenant(prisma, tenantA.id, (tx) => tx.contact.findUniqueOrThrow({ where: { id: contactA.id } }));
    expect(contato.nome).toBe("Novo Nome");
    expect(contato.tenantId).toBe(tenantA.id); // nunca sobrescrito pelo campo injetado
    expect(contato.origem).not.toBe("injetado"); // campo fora da allowlist nunca é aplicado
  });
});

describe("Tool Broker — tenant nunca vem do input do modelo (T3 §8)", () => {
  it("input contendo tenantId de outro tenant é ignorado — o contexto confiável sempre vence", async () => {
    await concederTudoParaYalla(tenantA.id, ["lead.consultar"]);
    const r = await executarTool(prisma, ctxYalla(tenantA.id), {
      toolId: "lead.consultar",
      toolCallId: `tc-${Date.now()}-8`,
      input: { tenantId: tenantB.id, leadId: "id-arbitrario-qualquer" },
    });
    expect(r.status).toBe("SUCCESS");
    expect((r.data as any).lead.id).toBe(leadA.id); // devolveu o lead do CONTEXTO (tenant A), nunca nada relacionado ao tenantId injetado
  });
});

describe("Tool Broker — IDOR (T3 §9)", () => {
  it("mesmo se o leadId do contexto pertencer a outro tenant (defesa em profundidade), a tool nunca devolve dado cross-tenant", async () => {
    await concederTudoParaYalla(tenantB.id, ["lead.consultar"]);
    const r = await executarTool(prisma, ctxYalla(tenantB.id, { leadId: leadA.id }), { toolId: "lead.consultar", toolCallId: `tc-${Date.now()}-9`, input: {} });
    // a tool consulta com tenantId=B mas leadId de A — RLS já devolve null, e o handler confere tenantId explicitamente também
    expect(r.status).toBe("SUCCESS");
    expect((r.data as any).encontrado).toBe(false);
  });

  it("consultar sem nenhum lead associado à conversa devolve 'não encontrado', nunca um erro que revele outro lead", async () => {
    await concederTudoParaYalla(tenantA.id, ["lead.consultar"]);
    const r = await executarTool(prisma, ctxYalla(tenantA.id, { leadId: undefined }), { toolId: "lead.consultar", toolCallId: `tc-${Date.now()}-10`, input: {} });
    expect(r.status).toBe("SUCCESS");
    expect((r.data as any).encontrado).toBe(false);
  });
});

describe("Tool Broker — idempotência / replay (T3 §25)", () => {
  it("mesmo toolCallId enviado duas vezes: side effect acontece só uma vez, segunda chamada devolve o mesmo resultado", async () => {
    await concederTudoParaYalla(tenantA.id, ["nota.registrar"]);
    const toolCallId = `tc-replay-${Date.now()}`;
    const input = { categoria: "OBSERVACAO" as const, conteudo: "nota de teste de replay" };

    const r1 = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "nota.registrar", toolCallId, input });
    const r2 = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "nota.registrar", toolCallId, input });

    expect(r1.status).toBe("SUCCESS");
    expect(r2.status).toBe("SUCCESS");
    expect((r1.data as any).noteId).toBe((r2.data as any).noteId);

    const notas = await withTenant(prisma, tenantA.id, (tx) => tx.note.findMany({ where: { tenantId: tenantA.id, leadId: leadA.id } }));
    expect(notas).toHaveLength(1); // nunca duplicou
  });

  it("toolCallId de uma chamada NEGADA (sem grant) não pode ser reaproveitado mesmo depois de conceder o grant", async () => {
    const toolCallId = `tc-negada-${Date.now()}`;
    const negada = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "nota.registrar", toolCallId, input: { categoria: "OBSERVACAO", conteudo: "x" } });
    expect(negada.status).toBe("FORBIDDEN");

    await concederTudoParaYalla(tenantA.id, ["nota.registrar"]);
    const retry = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "nota.registrar", toolCallId, input: { categoria: "OBSERVACAO", conteudo: "x" } });
    expect(retry.status).toBe("CONFLICT"); // mesmo toolCallId já "gasto" — precisa de um novo, não reexecuta silenciosamente
  });

  it("toolCallId diferente sempre executa de novo (não é dedup por conteúdo, só por toolCallId)", async () => {
    await concederTudoParaYalla(tenantA.id, ["nota.registrar"]);
    const input = { categoria: "OBSERVACAO" as const, conteudo: "mesmo conteúdo, toolCallId diferente" };
    await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "nota.registrar", toolCallId: `tc-a-${Date.now()}`, input });
    await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "nota.registrar", toolCallId: `tc-b-${Date.now()}`, input });
    const notas = await withTenant(prisma, tenantA.id, (tx) => tx.note.findMany({ where: { tenantId: tenantA.id, leadId: leadA.id, conteudo: { contains: input.conteudo } } }));
    expect(notas).toHaveLength(2);
  });
});

describe("Tool Broker — timeout (T3 §24)", () => {
  const lentoTool = defineTool({
    id: "teste.lento",
    nome: "Tool lenta de teste",
    descricao: "Só para testar timeout — nunca registrada fora de teste.",
    capability: "teste.lento",
    risk: "READ_ONLY",
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.boolean() }),
    sideEffects: false,
    requiresGate: false,
    timeoutMs: 50,
    idempotent: false,
    async handler() {
      await new Promise((r) => setTimeout(r, 500));
      return { ok: true };
    },
  });
  registrarTool(lentoTool);

  it("tool que excede o timeout declarado devolve TIMEOUT, nunca trava o chamador", async () => {
    await concederTudoParaYalla(tenantA.id, ["teste.lento"]);
    const inicio = Date.now();
    const r = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "teste.lento", toolCallId: `tc-timeout-${Date.now()}`, input: {} });
    const duracao = Date.now() - inicio;
    expect(r.status).toBe("TIMEOUT");
    expect(duracao).toBeLessThan(400); // o broker devolveu bem antes dos 500ms reais do handler
  });
});

describe("Tool Broker — Audit (T3 §27)", () => {
  it("execução com sucesso grava TOOL_REQUESTED/ALLOWED/STARTED/COMPLETED, nunca o conteúdo bruto da nota", async () => {
    await concederTudoParaYalla(tenantA.id, ["nota.registrar"]);
    const conteudoSecreto = "conteúdo bem específico que não deveria vazar no audit";
    const antes = new Date();
    await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "nota.registrar", toolCallId: `tc-audit-${Date.now()}`, input: { categoria: "OBSERVACAO", conteudo: conteudoSecreto } });

    // audit_logs é append-only e entidadeId="nota.registrar" se repete em
    // vários testes deste arquivo — filtra também por createdAt pra pegar
    // só os eventos DESTA chamada, não o acumulado de execuções anteriores.
    const eventos = await withTenant(prisma, tenantA.id, (tx) =>
      tx.auditLog.findMany({ where: { tenantId: tenantA.id, entidade: "Tool", entidadeId: "nota.registrar", createdAt: { gte: antes } }, orderBy: { createdAt: "asc" } }),
    );
    expect(eventos.map((e) => e.acao)).toEqual(["TOOL_REQUESTED", "TOOL_ALLOWED", "TOOL_STARTED", "TOOL_COMPLETED"]);
    for (const e of eventos) {
      expect(JSON.stringify(e.detalhe)).not.toContain(conteudoSecreto);
      expect(e.actorType).toBe("AGENTE");
      expect(e.actorLabel).toBe("yalla");
    }
  });

  it("tentativa negada grava TOOL_DENIED com o motivo", async () => {
    const r = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "lead.consultar", toolCallId: `tc-audit-deny-${Date.now()}`, input: {} });
    expect(r.status).toBe("FORBIDDEN");
    const eventos = await withTenant(prisma, tenantA.id, (tx) => tx.auditLog.findMany({ where: { tenantId: tenantA.id, acao: "TOOL_DENIED", entidadeId: "lead.consultar" } }));
    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos[0]!.resultado).toBe("sem_grant");
  });
});

describe("Tool Broker — RLS/isolamento multi-tenant", () => {
  it("ToolCall de um tenant não é visível pra outro", async () => {
    await concederTudoParaYalla(tenantA.id, ["lead.consultar"]);
    await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "lead.consultar", toolCallId: `tc-rls-${Date.now()}`, input: {} });
    const doTenantB = await withTenant(prisma, tenantB.id, (tx) => tx.toolCall.findMany({ where: { tenantId: tenantA.id } }));
    expect(doTenantB).toHaveLength(0);
  });

  it("sem contexto de tenant, nenhum ToolCall/AgentGrant é retornado — fail-closed", async () => {
    const calls = await prisma.toolCall.findMany();
    const grants = await prisma.agentGrant.findMany();
    expect(calls).toHaveLength(0);
    expect(grants).toHaveLength(0);
  });
});

describe("Lead — mover_stage (T3 §14): transições nunca arbitrárias", () => {
  it("avança exatamente uma etapa quando a próxima não é terminal", async () => {
    await concederTudoParaYalla(tenantA.id, ["lead.mover_stage"]);
    const r = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "lead.mover_stage", toolCallId: `tc-mover-${Date.now()}`, input: { motivo: "cliente respondeu" } });
    expect(r.status).toBe("SUCCESS");
    expect((r.data as any).moveu).toBe(true);
    expect((r.data as any).etapaNova).toBe(stageContatoA.nome ?? "Contato feito");

    const lead = await withTenant(prisma, tenantA.id, (tx) => tx.lead.findUniqueOrThrow({ where: { id: leadA.id } }));
    expect(lead.stageId).toBe(stageContatoA.id);

    // atômico: Note gravada junto (T3 §26)
    const notas = await withTenant(prisma, tenantA.id, (tx) => tx.note.findMany({ where: { tenantId: tenantA.id, leadId: leadA.id } }));
    expect(notas.some((n) => n.conteudo.includes("Avançou"))).toBe(true);
  });

  it("NUNCA move para uma etapa terminal (isWon) — mesmo sendo a 'próxima' na ordem", async () => {
    await concederTudoParaYalla(tenantA.id, ["lead.mover_stage"]);
    // move o lead manualmente pra etapa "Contato feito" (ordem 1) — a próxima (ordem 2) é "Ganho" (isWon)
    await withTenant(prisma, tenantA.id, (tx) => tx.lead.update({ where: { id: leadA.id }, data: { stageId: stageContatoA.id } }));

    const r = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "lead.mover_stage", toolCallId: `tc-mover-terminal-${Date.now()}`, input: { motivo: "tentativa de pular pro ganho" } });
    expect(r.status).toBe("SUCCESS");
    expect((r.data as any).moveu).toBe(false);
    expect((r.data as any).motivoRecusa).toMatch(/terminal/);

    const lead = await withTenant(prisma, tenantA.id, (tx) => tx.lead.findUniqueOrThrow({ where: { id: leadA.id } }));
    expect(lead.stageId).toBe(stageContatoA.id); // continua onde estava — nunca avançou pro Ganho
    expect(lead.status).toBe("ABERTO"); // nunca virou GANHO sozinho
  });

  it("não aceita nenhum id de etapa vindo do input — o destino é sempre calculado pelo servidor", async () => {
    await concederTudoParaYalla(tenantA.id, ["lead.mover_stage"]);
    const r = await executarTool(prisma, ctxYalla(tenantA.id), {
      toolId: "lead.mover_stage",
      toolCallId: `tc-mover-injecao-${Date.now()}`,
      input: { motivo: "tentando injetar destino", stageId: stageGanhoA.id, targetStage: "Ganho" } as any,
    });
    expect(r.status).toBe("SUCCESS");
    expect((r.data as any).etapaNova).toBe(stageContatoA.nome ?? "Contato feito"); // nunca "Ganho" — campo extra foi ignorado
  });
});

describe("Contato/histórico — consultas Camada 1 básicas", () => {
  it("contato.consultar devolve os dados do contato da conversa atual", async () => {
    await concederTudoParaYalla(tenantA.id, ["contato.consultar"]);
    const r = await executarTool(prisma, ctxYalla(tenantA.id), { toolId: "contato.consultar", toolCallId: `tc-contato-${Date.now()}`, input: {} });
    expect(r.status).toBe("SUCCESS");
    expect((r.data as any).contato.nome).toBe("Cliente Teste A");
  });
});
