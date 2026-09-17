import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, withSystem } from "../../src/tenant-db";

/**
 * "Zero vazamento entre tenants", provado por testes negativos — não só "não
 * vi vazar", mas "tentei ativamente vazar e falhou". Mesmo formato do
 * CongáOne (packages/db/tests/integration/tenant-isolation.test.ts).
 *
 * Uma única conexão (DATABASE_URL, role partiumarrocos_app) para tudo — o
 * isolamento não vem de trocar de role, vem do contexto de tenant setado por
 * withTenant()/withSystem().
 */
const prisma = new PrismaClient();

let tenantA: { id: string };
let tenantB: { id: string };
let pipelineA: { id: string };
let pipelineB: { id: string };
let stageA: { id: string };
let stageB: { id: string };
let contactA: { id: string };
let contactB: { id: string };

beforeAll(async () => {
  // Timeout maior que o padrão (10s): a primeira query contra o Postgres
  // local recém-inicializado pode ser lenta (disco/antivírus neste ambiente).
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (teste)", slug: `teste-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (teste)", slug: `teste-b-${Date.now()}` } });

  contactA = await withTenant(prisma, tenantA.id, (tx) =>
    tx.contact.create({ data: { tenantId: tenantA.id, nome: "Contato A" } }),
  );
  contactB = await withTenant(prisma, tenantB.id, (tx) =>
    tx.contact.create({ data: { tenantId: tenantB.id, nome: "Contato B" } }),
  );
  pipelineA = await withTenant(prisma, tenantA.id, (tx) =>
    tx.pipeline.create({ data: { tenantId: tenantA.id, nome: "Funil A" } }),
  );
  pipelineB = await withTenant(prisma, tenantB.id, (tx) =>
    tx.pipeline.create({ data: { tenantId: tenantB.id, nome: "Funil B" } }),
  );
  stageA = await withTenant(prisma, tenantA.id, (tx) =>
    tx.stage.create({ data: { tenantId: tenantA.id, pipelineId: pipelineA.id, nome: "Novo" } }),
  );
  stageB = await withTenant(prisma, tenantB.id, (tx) =>
    tx.stage.create({ data: { tenantId: tenantB.id, pipelineId: pipelineB.id, nome: "Novo" } }),
  );
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } });
    await tx.tenant.delete({ where: { id: tenantB.id } });
  });
  await prisma.$disconnect();
}, 30000);

describe("isolamento multi-tenant (RLS)", () => {
  it("a role de runtime (partiumarrocos_app) não tem BYPASSRLS", async () => {
    const rows = await prisma.$queryRaw<{ rolbypassrls: boolean }[]>`
      SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user
    `;
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it("sem contexto de tenant, nenhuma linha é retornada (fail-closed)", async () => {
    const contatos = await prisma.contact.findMany({
      where: { id: { in: [contactA.id, contactB.id] } },
    });
    expect(contatos).toHaveLength(0);
  });

  it("com o tenant A selecionado, só vejo contatos do tenant A", async () => {
    const contatos = await withTenant(prisma, tenantA.id, (tx) =>
      tx.contact.findMany({ where: { id: { in: [contactA.id, contactB.id] } } }),
    );
    expect(contatos.map((c) => c.id)).toEqual([contactA.id]);
  });

  it("com o tenant A selecionado, buscar contato do tenant B por id retorna nulo", async () => {
    const contato = await withTenant(prisma, tenantA.id, (tx) =>
      tx.contact.findUnique({ where: { id: contactB.id } }),
    );
    expect(contato).toBeNull();
  });

  it("com o tenant A selecionado, criar contato com tenantId do tenant B falha", async () => {
    await expect(
      withTenant(prisma, tenantA.id, (tx) =>
        tx.contact.create({ data: { tenantId: tenantB.id, nome: "Invasão" } }),
      ),
    ).rejects.toThrow();
  });

  it("com o tenant B selecionado, só vejo contatos do tenant B", async () => {
    const contatos = await withTenant(prisma, tenantB.id, (tx) =>
      tx.contact.findMany({ where: { id: { in: [contactA.id, contactB.id] } } }),
    );
    expect(contatos.map((c) => c.id)).toEqual([contactB.id]);
  });

  it("withSystem enxerga os dois tenants (escape hatch controlado)", async () => {
    const contatos = await withSystem(prisma, (tx) =>
      tx.contact.findMany({ where: { id: { in: [contactA.id, contactB.id] } } }),
    );
    expect(contatos.map((c) => c.id).sort()).toEqual([contactA.id, contactB.id].sort());
  });

  it("Lead: tenant B não vê lead criado no tenant A", async () => {
    const leadA = await withTenant(prisma, tenantA.id, (tx) =>
      tx.lead.create({ data: { tenantId: tenantA.id, contactId: contactA.id, pipelineId: pipelineA.id, stageId: stageA.id } }),
    );

    const visivelParaB = await withTenant(prisma, tenantB.id, (tx) => tx.lead.findUnique({ where: { id: leadA.id } }));
    expect(visivelParaB).toBeNull();
  });

  it("Lead: não pode ser criado no tenant B apontando para contato do tenant A", async () => {
    await expect(
      withTenant(prisma, tenantB.id, (tx) =>
        tx.lead.create({ data: { tenantId: tenantB.id, contactId: contactA.id, pipelineId: pipelineB.id, stageId: stageB.id } }),
      ),
    ).rejects.toThrow();
  });

  it("Lead: não pode ser criado no tenant B apontando para pipeline/stage do tenant A", async () => {
    await expect(
      withTenant(prisma, tenantB.id, (tx) =>
        tx.lead.create({ data: { tenantId: tenantB.id, contactId: contactB.id, pipelineId: pipelineA.id, stageId: stageA.id } }),
      ),
    ).rejects.toThrow();
  });

  it("Membership: não pode ser criado no tenant B com role do tenant A", async () => {
    const roleA = await withTenant(prisma, tenantA.id, (tx) =>
      tx.role.create({ data: { tenantId: tenantA.id, nome: `Papel teste ${Date.now()}` } }),
    );
    const userTeste = await prisma.user.create({
      data: { email: `teste-membership-${Date.now()}@example.com`, passwordHash: "x" },
    });

    await expect(
      withTenant(prisma, tenantB.id, (tx) =>
        tx.membership.create({ data: { userId: userTeste.id, tenantId: tenantB.id, roleId: roleA.id } }),
      ),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: userTeste.id } });
  });

  it("Permission: catálogo global, visível para qualquer tenant sem contexto setado", async () => {
    const permissao = await withSystem(prisma, (tx) =>
      tx.permission.create({ data: { chave: `teste.${Date.now()}` } }),
    );
    const visivel = await prisma.permission.findUnique({ where: { id: permissao.id } });
    expect(visivel).not.toBeNull();

    await withSystem(prisma, (tx) => tx.permission.delete({ where: { id: permissao.id } }));
  });
});
