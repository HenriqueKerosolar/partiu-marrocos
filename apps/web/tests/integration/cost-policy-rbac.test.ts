import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, withSystem, withTenant } from "@partiumarrocos/db";
import { garantirPermissoes } from "../helpers/garantir-permissoes";

const mockRequireAuthContext = vi.fn();
vi.mock("@/lib/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/session")>();
  return { ...actual, requireAuthContext: () => mockRequireAuthContext() };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { salvarPoliticaCusto, removerPoliticaCusto } = await import("@/app/actions/cost");
const { ForbiddenError } = await import("@/lib/rbac");

let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };

function ctx(userId: string, email: string, tenantId: string, chaves: string[]) {
  return { sessionId: "s1", user: { id: userId, email, mustChangePassword: false }, tenantId, role: null, permissions: new Set(chaves) };
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (cost RBAC teste)", slug: `cost-rbac-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (cost RBAC teste)", slug: `cost-rbac-b-${Date.now()}` } });
  await garantirPermissoes(prisma);
  userA = await prisma.user.create({ data: { email: `cost-rbac-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  userB = await prisma.user.create({ data: { email: `cost-rbac-b-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const roleA = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: roleA.id } });
    const roleB = await tx.role.create({ data: { tenantId: tenantB.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userB.id, tenantId: tenantB.id, roleId: roleB.id } });
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
  mockRequireAuthContext.mockReset();
  await withSystem(prisma, (tx) => tx.costPolicy.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }));
});

describe("cost.ts actions — RBAC", () => {
  it("salvarPoliticaCusto sem cost.manage é rejeitado, nada é escrito", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(userA.id, userA.email, tenantA.id, ["cost.view"]));
    await expect(salvarPoliticaCusto(formData({ escopo: "TENANT", periodo: "DIARIO", limite: "10" }))).rejects.toThrow(ForbiddenError);

    const politicas = await withTenant(prisma, tenantA.id, (tx) => tx.costPolicy.findMany({ where: { tenantId: tenantA.id } }));
    expect(politicas).toHaveLength(0);
  });

  it("removerPoliticaCusto sem cost.manage é rejeitado", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(userA.id, userA.email, tenantA.id, ["cost.manage"]));
    const res = await salvarPoliticaCusto(formData({ escopo: "TENANT", periodo: "DIARIO", limite: "10" }));
    expect(res.ok).toBe(true);
    const politica = await withTenant(prisma, tenantA.id, (tx) => tx.costPolicy.findFirstOrThrow({ where: { tenantId: tenantA.id } }));

    mockRequireAuthContext.mockResolvedValue(ctx(userA.id, userA.email, tenantA.id, ["cost.view"]));
    await expect(removerPoliticaCusto(politica.id)).rejects.toThrow(ForbiddenError);
  });

  it("com cost.manage: cria e depois remove uma política com sucesso", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(userA.id, userA.email, tenantA.id, ["cost.manage"]));
    const criar = await salvarPoliticaCusto(formData({ escopo: "PROVIDER", escopoValor: "anthropic", periodo: "MENSAL", limite: "50", moeda: "USD", alertaPercentual: "75" }));
    expect(criar.ok).toBe(true);

    const politica = await withTenant(prisma, tenantA.id, (tx) => tx.costPolicy.findFirstOrThrow({ where: { tenantId: tenantA.id, escopo: "PROVIDER" } }));
    expect(politica.escopoValor).toBe("anthropic");
    expect(politica.limite.toString()).toBe("50");

    const remover = await removerPoliticaCusto(politica.id);
    expect(remover.ok).toBe(true);
    const depois = await withTenant(prisma, tenantA.id, (tx) => tx.costPolicy.findUnique({ where: { id: politica.id } }));
    expect(depois).toBeNull();
  });

  it("rejeita escopo/período inválido e limite negativo/ausente na fronteira da action", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(userA.id, userA.email, tenantA.id, ["cost.manage"]));
    expect((await salvarPoliticaCusto(formData({ escopo: "NAO_EXISTE", periodo: "DIARIO", limite: "10" }))).error).toBeTruthy();
    expect((await salvarPoliticaCusto(formData({ escopo: "TENANT", periodo: "NAO_EXISTE", limite: "10" }))).error).toBeTruthy();
    expect((await salvarPoliticaCusto(formData({ escopo: "TENANT", periodo: "DIARIO", limite: "-5" }))).error).toBeTruthy();
    expect((await salvarPoliticaCusto(formData({ escopo: "TENANT", periodo: "DIARIO", limite: "" }))).error).toBeTruthy();
    expect((await salvarPoliticaCusto(formData({ escopo: "PROVIDER", periodo: "DIARIO", limite: "10" }))).error).toBeTruthy(); // escopoValor ausente pra escopo != TENANT
  });

  it("IDOR: usuário do tenant B (com cost.manage em B) não remove política do tenant A", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(userA.id, userA.email, tenantA.id, ["cost.manage"]));
    await salvarPoliticaCusto(formData({ escopo: "TENANT", periodo: "DIARIO", limite: "10" }));
    const politicaA = await withTenant(prisma, tenantA.id, (tx) => tx.costPolicy.findFirstOrThrow({ where: { tenantId: tenantA.id } }));

    mockRequireAuthContext.mockResolvedValue(ctx(userB.id, userB.email, tenantB.id, ["cost.manage"]));
    const res = await removerPoliticaCusto(politicaA.id);
    expect(res.error).toBeTruthy();

    const aindaExiste = await withTenant(prisma, tenantA.id, (tx) => tx.costPolicy.findUnique({ where: { id: politicaA.id } }));
    expect(aindaExiste).not.toBeNull();
  });
});
