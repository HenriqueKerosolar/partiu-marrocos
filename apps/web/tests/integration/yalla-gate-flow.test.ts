import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, withSystem, withTenant, decidirGate, criarGate } from "@partiumarrocos/db";
import { solicitarAcaoDeRisco, executarAcaoControladaSeAprovado } from "@/lib/gates/yallaRiskyAction";

/**
 * PM-T1-003 — prova exigida pela autorização: Yalla não executa ação de
 * risco sem aprovação. Cobre os 3 fluxos pedidos: aprovação libera, rejeição
 * impede, expiração impede.
 */
let tenant: { id: string };
let humano: { id: string };
let leadId: string;

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (yalla-gate teste)", slug: `yg-${Date.now()}` } });
  humano = await prisma.user.create({ data: { email: `yalla-gate-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenant.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: humano.id, tenantId: tenant.id, roleId: role.id } });
  });
  const contact = await withTenant(prisma, tenant.id, (tx) => tx.contact.create({ data: { tenantId: tenant.id, nome: "Contato teste" } }));
  const pipeline = await withTenant(prisma, tenant.id, (tx) => tx.pipeline.create({ data: { tenantId: tenant.id, nome: "Funil" } }));
  const stage = await withTenant(prisma, tenant.id, (tx) => tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Novo" } }));
  const lead = await withTenant(prisma, tenant.id, (tx) =>
    tx.lead.create({ data: { tenantId: tenant.id, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } }),
  );
  leadId = lead.id;
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenant.id } }));
  await prisma.$disconnect();
}, 30000);

describe("Yalla + Gate — ação de risco nunca executa sem aprovação", () => {
  it("solicita → gate PENDENTE → ação controlada NÃO executa (bloqueada)", async () => {
    const { gateId } = await solicitarAcaoDeRisco({ tenantId: tenant.id, leadId, categoria: "COMERCIAL", descricao: "Dar 15% de desconto" });

    const resultado = await executarAcaoControladaSeAprovado(tenant.id, gateId);
    expect(resultado.executado).toBe(false);
    if (!resultado.executado) {
      expect(resultado.motivo).toBe("GATE_NAO_APROVADO");
      expect(resultado.statusAtual).toBe("PENDENTE");
    }

    const notas = await withTenant(prisma, tenant.id, (tx) => tx.note.findMany({ where: { tenantId: tenant.id, leadId } }));
    expect(notas).toHaveLength(0);
  });

  it("solicita → humano aprova → ação controlada EXECUTA e é auditável", async () => {
    const { gateId } = await solicitarAcaoDeRisco({ tenantId: tenant.id, leadId, categoria: "COMERCIAL", descricao: "Dar 10% de desconto" });

    const decisao = await decidirGate(prisma, { tenantId: tenant.id, gateId, decisao: "APROVADO", decisorId: humano.id });
    expect(decisao.ok).toBe(true);

    const resultado = await executarAcaoControladaSeAprovado(tenant.id, gateId);
    expect(resultado.executado).toBe(true);

    const notas = await withTenant(prisma, tenant.id, (tx) => tx.note.findMany({ where: { tenantId: tenant.id, leadId } }));
    expect(notas.some((n) => n.conteudo.includes(gateId))).toBe(true);

    // trilha auditável completa: pedido + aprovação, ambos com actor correto
    const eventos = await withTenant(prisma, tenant.id, (tx) =>
      tx.auditLog.findMany({ where: { tenantId: tenant.id, entidadeId: gateId }, orderBy: { createdAt: "asc" } }),
    );
    expect(eventos.map((e) => e.acao)).toEqual(["gate_requested", "gate_aprovado"]);
    expect(eventos[0]!.actorType).toBe("AGENTE");
    expect(eventos[0]!.actorLabel).toBe("yalla");
    expect(eventos[1]!.actorType).toBe("HUMANO");
    expect(eventos[1]!.userId).toBe(humano.id);
  });

  it("solicita → humano rejeita → ação controlada NUNCA executa", async () => {
    const { gateId } = await solicitarAcaoDeRisco({ tenantId: tenant.id, leadId, categoria: "ACAO_IRREVERSIVEL", descricao: "Cancelar reserva" });
    await decidirGate(prisma, { tenantId: tenant.id, gateId, decisao: "REJEITADO", decisorId: humano.id });

    const resultado = await executarAcaoControladaSeAprovado(tenant.id, gateId);
    expect(resultado.executado).toBe(false);
    if (!resultado.executado) expect(resultado.statusAtual).toBe("REJEITADO");
  });

  it("solicita → gate expira sem decisão → ação controlada NUNCA executa", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenant.id,
      categoria: "FINANCEIRO",
      acaoProposta: "Estornar pagamento",
      motivo: "Solicitado pelo agente Yalla durante atendimento",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
      metadata: { leadId },
      expiraEmMs: -1000, // já nasce vencido, sem precisar esperar tempo real
    });

    // uma tentativa de aprovação tardia também precisa falhar
    const tentativaTardia = await decidirGate(prisma, { tenantId: tenant.id, gateId: gate.id, decisao: "APROVADO", decisorId: humano.id });
    expect(tentativaTardia.ok).toBe(false);

    const resultado = await executarAcaoControladaSeAprovado(tenant.id, gate.id);
    expect(resultado.executado).toBe(false);
    if (!resultado.executado) expect(resultado.statusAtual).toBe("EXPIRADO");
  });
});
