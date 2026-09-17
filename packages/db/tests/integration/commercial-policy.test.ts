import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma, withSystem, withTenant, obterLimitesComerciais, atualizarPoliticaComercial, LIMITES_PADRAO } from "../../src";

/**
 * CommercialPolicy (PM-NIGHT-RUN-02, Etapa 3, §23) — corrige a limitação
 * de limiares fixos de Proposal Foundation 01. Critério de teste negativo
 * real: tenant sem política configurada nunca muda de comportamento,
 * valores inválidos nunca gravam, e toda alteração é auditada.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (policy teste)", slug: `pol-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (policy teste)", slug: `pol-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `pol-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: role.id } });
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
    await tx.commercialPolicy.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("obterLimitesComerciais — default seguro sem quebrar tenant existente", () => {
  it("tenant sem CommercialPolicy própria usa LIMITES_PADRAO", async () => {
    const limites = await obterLimitesComerciais(prisma, tenantA.id);
    expect(limites).toEqual(LIMITES_PADRAO);
  });
});

describe("atualizarPoliticaComercial — grava, valida, audita", () => {
  it("configura um limiar customizado e obterLimitesComerciais reflete a mudança", async () => {
    const r = await atualizarPoliticaComercial(prisma, { tenantId: tenantA.id, limites: { limiteDescontoRelevante: 0.05 }, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.limites.limiteDescontoRelevante).toBe(0.05);

    const limites = await obterLimitesComerciais(prisma, tenantA.id);
    expect(limites.limiteDescontoRelevante).toBe(0.05);
    expect(limites.limiteMudancaPrecoExcepcional).toBe(LIMITES_PADRAO.limiteMudancaPrecoExcepcional); // campo não informado mantém o padrão
  });

  it("segunda chamada faz update parcial, preservando os demais campos já configurados", async () => {
    await atualizarPoliticaComercial(prisma, { tenantId: tenantA.id, limites: { limiteDescontoRelevante: 0.05 }, actorType: "HUMANO", userId: userA.id });
    await atualizarPoliticaComercial(prisma, { tenantId: tenantA.id, limites: { limiteMargemMinima: 0.2 }, actorType: "HUMANO", userId: userA.id });

    const limites = await obterLimitesComerciais(prisma, tenantA.id);
    expect(limites.limiteDescontoRelevante).toBe(0.05); // preservado da chamada anterior
    expect(limites.limiteMargemMinima).toBe(0.2);
  });

  it("valor fora de (0,1] é rejeitado, nunca grava", async () => {
    const r1 = await atualizarPoliticaComercial(prisma, { tenantId: tenantA.id, limites: { limiteDescontoRelevante: 0 }, actorType: "HUMANO", userId: userA.id });
    const r2 = await atualizarPoliticaComercial(prisma, { tenantId: tenantA.id, limites: { limiteMargemMinima: 1.5 }, actorType: "HUMANO", userId: userA.id });
    const r3 = await atualizarPoliticaComercial(prisma, { tenantId: tenantA.id, limites: { limiteMudancaPrecoExcepcional: -0.1 }, actorType: "HUMANO", userId: userA.id });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);

    const limites = await obterLimitesComerciais(prisma, tenantA.id);
    expect(limites).toEqual(LIMITES_PADRAO); // nada gravou
  });

  it("toda alteração é auditada", async () => {
    await atualizarPoliticaComercial(prisma, { tenantId: tenantA.id, limites: { limiteDescontoRelevante: 0.1 }, actorType: "HUMANO", userId: userA.id, actorLabel: "admin" });
    const evento = await withSystem(prisma, (tx) => tx.auditLog.findFirstOrThrow({ where: { tenantId: tenantA.id, acao: "COMMERCIAL_POLICY_ATUALIZADA" } }));
    expect(evento.resultado).toBe("ok");
  });
});

describe("CommercialPolicy — isolamento multi-tenant (RLS)", () => {
  it("configurar a política do Tenant A nunca afeta o Tenant B", async () => {
    await atualizarPoliticaComercial(prisma, { tenantId: tenantA.id, limites: { limiteDescontoRelevante: 0.01 }, actorType: "HUMANO", userId: userA.id });
    const limitesB = await obterLimitesComerciais(prisma, tenantB.id);
    expect(limitesB).toEqual(LIMITES_PADRAO);
  });
});
