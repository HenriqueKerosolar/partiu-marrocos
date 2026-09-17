import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, withSystem, withTenant, criarGate } from "@partiumarrocos/db";
import { garantirPermissoes } from "../helpers/garantir-permissoes";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/session", () => ({ getAuthContext: () => mockGetAuthContext() }));

const { POST } = await import("@/app/api/gates/[id]/decidir/route");

let tenant: { id: string };
let outroTenant: { id: string };
let decisor: { id: string; email: string };

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (rota gates teste)", slug: `gr-${Date.now()}` } });
  outroTenant = await prisma.tenant.create({ data: { nome: "Outro tenant (rota gates teste)", slug: `gr-outro-${Date.now()}` } });
  await garantirPermissoes(prisma);
  decisor = await prisma.user.create({ data: { email: `gates-route-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenant.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: decisor.id, tenantId: tenant.id, roleId: role.id } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenant.id } });
    await tx.tenant.delete({ where: { id: outroTenant.id } });
  });
  await prisma.$disconnect();
}, 30000);

function ctxComPermissao(tenantId: string, chaves: string[]) {
  return { sessionId: "s1", user: { id: decisor.id, email: decisor.email, mustChangePassword: false }, tenantId, role: null, permissions: new Set(chaves) };
}

function req(body: unknown): Request {
  return new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function criarGatePendente() {
  return criarGate(prisma, {
    tenantId: tenant.id,
    categoria: "COMERCIAL",
    acaoProposta: "teste rota",
    motivo: "teste",
    solicitanteTipo: "AGENTE",
    solicitanteLabel: "yalla",
  });
}

describe("POST /api/gates/[id]/decidir", () => {
  it("sem sessão, rejeita com 401", async () => {
    mockGetAuthContext.mockResolvedValueOnce(null);
    const gate = await criarGatePendente();
    const res = await POST(req({ decisao: "APROVADO" }), { params: { id: gate.id } });
    expect(res.status).toBe(401);
  });

  it("sem gates.decide, rejeita com 403", async () => {
    mockGetAuthContext.mockResolvedValueOnce(ctxComPermissao(tenant.id, ["gates.view"]));
    const gate = await criarGatePendente();
    const res = await POST(req({ decisao: "APROVADO" }), { params: { id: gate.id } });
    expect(res.status).toBe(403);
  });

  it("decisao ausente/inválida retorna 400", async () => {
    mockGetAuthContext.mockResolvedValueOnce(ctxComPermissao(tenant.id, ["gates.decide"]));
    const gate = await criarGatePendente();
    const res = await POST(req({ decisao: "SEI_LA" }), { params: { id: gate.id } });
    expect(res.status).toBe(400);
  });

  it("corpo que não é JSON válido retorna 400, não derruba a rota", async () => {
    mockGetAuthContext.mockResolvedValueOnce(ctxComPermissao(tenant.id, ["gates.decide"]));
    const gate = await criarGatePendente();
    const res = await POST(new Request("http://localhost", { method: "POST", body: "não é json" }), { params: { id: gate.id } });
    expect(res.status).toBe(400);
  });

  it("gate inexistente (ou de outro tenant — sob RLS dá na mesma) retorna 404, sem distinguir os dois casos", async () => {
    mockGetAuthContext.mockResolvedValueOnce(ctxComPermissao(tenant.id, ["gates.decide"]));
    const resInexistente = await POST(req({ decisao: "APROVADO" }), { params: { id: "nao-existe" } });
    expect(resInexistente.status).toBe(404);

    // gate real, mas pedido no contexto do tenant ERRADO — RLS faz parecer que não existe
    const gateDoOutroTenant = await criarGate(prisma, {
      tenantId: outroTenant.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste isolamento via rota",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });
    mockGetAuthContext.mockResolvedValueOnce(ctxComPermissao(tenant.id, ["gates.decide"]));
    const resCrossTenant = await POST(req({ decisao: "APROVADO" }), { params: { id: gateDoOutroTenant.id } });
    expect(resCrossTenant.status).toBe(404);
  });

  it("com gates.decide, aprova com sucesso e grava o decisor real", async () => {
    mockGetAuthContext.mockResolvedValueOnce(ctxComPermissao(tenant.id, ["gates.decide"]));
    const gate = await criarGatePendente();
    const res = await POST(req({ decisao: "APROVADO" }), { params: { id: gate.id } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gate.status).toBe("APROVADO");
    expect(json.gate.decisorId).toBe(decisor.id);
  });

  it("decidir de novo o mesmo gate (já aprovado) retorna 409, não 200", async () => {
    mockGetAuthContext.mockResolvedValueOnce(ctxComPermissao(tenant.id, ["gates.decide"]));
    const gate = await criarGatePendente();
    await POST(req({ decisao: "APROVADO" }), { params: { id: gate.id } });

    mockGetAuthContext.mockResolvedValueOnce(ctxComPermissao(tenant.id, ["gates.decide"]));
    const segunda = await POST(req({ decisao: "REJEITADO" }), { params: { id: gate.id } });
    expect(segunda.status).toBe(409);
  });
});
