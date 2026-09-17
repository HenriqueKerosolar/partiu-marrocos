import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withSystem, withTenant } from "../../src/tenant-db";
import { registrarAttributionTouch, contarLeadsPorAtribuicao } from "../../src/attribution";

/**
 * T6 — Attribution. Mesmo critério de teste negativo real das outras
 * suítes deste pacote: tentar ativamente vazar/burlar e falhar, não só
 * "não vi vazar".
 */
const prisma = new PrismaClient();

let tenantA: { id: string };
let tenantB: { id: string };
let contactA: { id: string };
let leadA: { id: string };

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (attribution teste)", slug: `attr-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (attribution teste)", slug: `attr-b-${Date.now()}` } });

  await withTenant(prisma, tenantA.id, async (tx) => {
    contactA = await tx.contact.create({ data: { tenantId: tenantA.id, nome: "Contato A", telefone: "5511999990000" } });
    const pipeline = await tx.pipeline.create({ data: { tenantId: tenantA.id, nome: "Funil", isDefault: true } });
    const stage = await tx.stage.create({ data: { tenantId: tenantA.id, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    leadA = await tx.lead.create({ data: { tenantId: tenantA.id, contactId: contactA.id, pipelineId: pipeline.id, stageId: stage.id } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } });
    await tx.tenant.delete({ where: { id: tenantB.id } });
  });
  await prisma.$disconnect();
}, 30000);

describe("registrarAttributionTouch — sanitização (nunca confia no valor recebido)", () => {
  it("corta valores muito longos no tamanho máximo, nunca lança erro", async () => {
    const touch = await withTenant(prisma, tenantA.id, (tx) =>
      registrarAttributionTouch(tx, {
        tenantId: tenantA.id,
        contactId: contactA.id,
        leadId: leadA.id,
        source: "a".repeat(500),
        landingPage: "https://partiumarrocos.com.br/?" + "x".repeat(2000),
      }),
    );
    expect(touch.source!.length).toBe(100);
    expect(touch.landingPage!.length).toBe(1000);
  });

  it("string vazia/só espaço vira null, não string vazia gravada", async () => {
    const touch = await withTenant(prisma, tenantA.id, (tx) =>
      registrarAttributionTouch(tx, { tenantId: tenantA.id, contactId: contactA.id, source: "   ", campaign: "" }),
    );
    expect(touch.source).toBeNull();
    expect(touch.campaign).toBeNull();
  });

  it("campos normais gravam exatamente como enviados (só trim)", async () => {
    const touch = await withTenant(prisma, tenantA.id, (tx) =>
      registrarAttributionTouch(tx, { tenantId: tenantA.id, contactId: contactA.id, source: "  google  ", medium: "cpc", campaign: "black-friday-2026" }),
    );
    expect(touch.source).toBe("google");
    expect(touch.medium).toBe("cpc");
    expect(touch.campaign).toBe("black-friday-2026");
  });

  it("um valor tipo tentativa de injeção (script tag) vira só texto — nunca interpretado, nunca quebra a query", async () => {
    const malicioso = "<script>alert(1)</script>";
    const touch = await withTenant(prisma, tenantA.id, (tx) =>
      registrarAttributionTouch(tx, { tenantId: tenantA.id, contactId: contactA.id, source: malicioso }),
    );
    expect(touch.source).toBe(malicioso.slice(0, 100)); // gravado como string literal, não executado
  });
});

describe("AttributionTouch — isolamento multi-tenant (RLS)", () => {
  it("Tenant B não lê AttributionTouch do Tenant A", async () => {
    await withTenant(prisma, tenantA.id, (tx) => registrarAttributionTouch(tx, { tenantId: tenantA.id, contactId: contactA.id, leadId: leadA.id, source: "isolamento-teste" }));
    const doB = await withTenant(prisma, tenantB.id, (tx) => tx.attributionTouch.findMany({ where: { source: "isolamento-teste" } }));
    expect(doB).toHaveLength(0);
  });

  it("Tenant B não consegue gravar um AttributionTouch apontando pro Contact/Lead do Tenant A (FK composta protege)", async () => {
    await expect(
      withTenant(prisma, tenantB.id, (tx) => registrarAttributionTouch(tx, { tenantId: tenantB.id, contactId: contactA.id, leadId: leadA.id, source: "idor-teste" })),
    ).rejects.toThrow();
  });

  it("sem contexto de tenant, nenhuma linha é retornada — fail-closed", async () => {
    const semContexto = await prisma.attributionTouch.findMany();
    expect(semContexto).toHaveLength(0);
  });
});

describe("contarLeadsPorAtribuicao — suporta a consulta analítica pedida (leads por source/campaign)", () => {
  it("agrupa corretamente por source, só contando touches com lead associado", async () => {
    const tenantSolo = await prisma.tenant.create({ data: { nome: "Tenant attribution analytics", slug: `attr-analytics-${Date.now()}` } });
    await withTenant(prisma, tenantSolo.id, async (tx) => {
      const pipeline = await tx.pipeline.create({ data: { tenantId: tenantSolo.id, nome: "Funil", isDefault: true } });
      const stage = await tx.stage.create({ data: { tenantId: tenantSolo.id, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });

      for (const [i, source] of ["google", "google", "instagram"].entries()) {
        const contact = await tx.contact.create({ data: { tenantId: tenantSolo.id, nome: `C${i}`, telefone: `551199999000${i}` } });
        const lead = await tx.lead.create({ data: { tenantId: tenantSolo.id, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
        await registrarAttributionTouch(tx, { tenantId: tenantSolo.id, contactId: contact.id, leadId: lead.id, source });
      }
      // touch sem lead associado (ex.: hipotético FIRST touch futuro) não deve contar
      const contactSemLead = await tx.contact.create({ data: { tenantId: tenantSolo.id, nome: "Sem lead", telefone: "5511999999009" } });
      await registrarAttributionTouch(tx, { tenantId: tenantSolo.id, contactId: contactSemLead.id, source: "google", tipo: "FIRST" });
    });

    const resumo = await contarLeadsPorAtribuicao(prisma, tenantSolo.id, "source");
    expect(resumo).toEqual([
      { chave: "google", totalLeads: 2 },
      { chave: "instagram", totalLeads: 1 },
    ]);

    await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantSolo.id } }));
  });
});
