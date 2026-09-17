import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, withSystem, withTenant } from "@partiumarrocos/db";
import { garantirPermissoes } from "../helpers/garantir-permissoes";

const mockRequireAuthContext = vi.fn();
vi.mock("@/lib/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/session")>();
  return { ...actual, requireAuthContext: () => mockRequireAuthContext() };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { cancelarJobAction, reenviarJobAction } = await import("@/app/actions/jobs");
const { ForbiddenError } = await import("@/lib/rbac");

let tenantA: { id: string };
let userA: { id: string; email: string };

function ctx(chaves: string[]) {
  return { sessionId: "s1", user: { id: userA.id, email: userA.email, mustChangePassword: false }, tenantId: tenantA.id, role: null, permissions: new Set(chaves) };
}

async function criarJob(status: "READY" | "FAILED" | "DEAD_LETTER") {
  return withTenant(prisma, tenantA.id, (tx) =>
    tx.job.create({ data: { tenantId: tenantA.id, type: "teste.rbac", payload: {}, source: "teste", status } }),
  );
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (job actions RBAC teste)", slug: `job-actions-rbac-a-${Date.now()}` } });
  await garantirPermissoes(prisma);
  userA = await prisma.user.create({ data: { email: `job-actions-rbac-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const roleA = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: roleA.id } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantA.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  mockRequireAuthContext.mockReset();
  await withSystem(prisma, (tx) => tx.job.deleteMany({ where: { tenantId: tenantA.id } }));
});

describe("jobs.ts actions — RBAC", () => {
  it("cancelarJobAction sem jobs.manage é rejeitado, Job não muda", async () => {
    const job = await criarJob("READY");
    mockRequireAuthContext.mockResolvedValue(ctx([]));

    await expect(cancelarJobAction(job.id)).rejects.toThrow(ForbiddenError);

    const depois = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(depois.status).toBe("READY");
  });

  it("cancelarJobAction com jobs.manage cancela o Job com sucesso", async () => {
    const job = await criarJob("READY");
    mockRequireAuthContext.mockResolvedValue(ctx(["jobs.manage"]));

    const res = await cancelarJobAction(job.id);
    expect(res.ok).toBe(true);

    const depois = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(depois.status).toBe("CANCELLED");
  });

  it("reenviarJobAction sem jobs.manage é rejeitado, Job não muda", async () => {
    const job = await criarJob("FAILED");
    mockRequireAuthContext.mockResolvedValue(ctx([]));

    await expect(reenviarJobAction(job.id)).rejects.toThrow(ForbiddenError);

    const depois = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(depois.status).toBe("FAILED");
  });

  it("reenviarJobAction com jobs.manage reenvia o Job com sucesso", async () => {
    const job = await criarJob("DEAD_LETTER");
    mockRequireAuthContext.mockResolvedValue(ctx(["jobs.manage"]));

    const res = await reenviarJobAction(job.id);
    expect(res.ok).toBe(true);

    const depois = await withTenant(prisma, tenantA.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(depois.status).toBe("READY");
    expect(depois.attempts).toBe(0);
  });
});
