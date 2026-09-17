import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, withSystem, withTenant, salvarPolitica } from "@partiumarrocos/db";

/**
 * T2 — Cost Control integrado ao Yalla (primeiro consumidor real, per
 * autorização §15). `fetch` sempre mockado — nenhuma chamada de IA real ou
 * paga acontece em nenhum teste deste arquivo.
 */
const { gerarRespostaYalla } = await import("@/lib/ai/yalla");
const { salvarConfigIA } = await import("@/app/actions/ai");

const mockRequireAuthContext = vi.fn();
vi.mock("@/lib/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/session")>();
  return { ...actual, requireAuthContext: () => mockRequireAuthContext() };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let tenant: { id: string };
let admin: { id: string; email: string };
const PROVIDER_TESTE = "anthropic";

function ctx(tenantId: string, chaves: string[]) {
  return { sessionId: "s1", user: { id: admin.id, email: admin.email, mustChangePassword: false }, tenantId, role: null, permissions: new Set(chaves) };
}

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (cost x yalla teste)", slug: `cost-yalla-${Date.now()}` } });
  admin = await prisma.user.create({ data: { email: `cost-yalla-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenant.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: admin.id, tenantId: tenant.id, roleId: role.id } });
  });

  mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["whatsapp.manage"]));
  const fd = new FormData();
  fd.set("provider", "anthropic");
  fd.set("apiKey", "sk-teste-cost-yalla");
  await salvarConfigIA(fd);
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenant.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  vi.unstubAllGlobals();
  await withSystem(prisma, async (tx) => {
    await tx.costEvent.deleteMany({ where: { tenantId: tenant.id } });
    await tx.costUsage.deleteMany({ where: { tenantId: tenant.id } });
    await tx.costPolicy.deleteMany({ where: { tenantId: tenant.id } });
    await tx.gate.deleteMany({ where: { tenantId: tenant.id } });
    await tx.message.deleteMany({ where: { tenantId: tenant.id } });
    await tx.conversation.deleteMany({ where: { tenantId: tenant.id } });
    await tx.contact.deleteMany({ where: { tenantId: tenant.id } });
  });
});

async function criarConversaComMensagem(texto: string) {
  const contato = await withTenant(prisma, tenant.id, (tx) => tx.contact.create({ data: { tenantId: tenant.id, nome: "Contato cost-yalla" } }));
  const conversa = await withTenant(prisma, tenant.id, (tx) => tx.conversation.create({ data: { tenantId: tenant.id, contactId: contato.id, channel: "WHATSAPP" } }));
  await withTenant(prisma, tenant.id, (tx) => tx.message.create({ data: { tenantId: tenant.id, conversationId: conversa.id, direction: "ENTRADA", senderType: "CONTATO", conteudo: texto } }));
  return conversa.id;
}

describe("Cost Control × Yalla — PRE-CHECK nunca gasta uma chamada real quando já bloqueado", () => {
  it("política estourada: gerarRespostaYalla retorna null SEM chamar fetch, e abre um Gate", async () => {
    // Sem preço cadastrado, o custo estimado seria UNKNOWN (nunca compara
    // contra limite — ver cost-control.ts) — este teste é especificamente
    // sobre o caminho "custo CONHECIDO e acima do limite", por isso cadastra
    // um preço de teste primeiro.
    await prisma.modelPrice.create({
      data: { provider: "anthropic", moeda: "USD", unidade: "token", precoEntrada: "1", precoSaida: "1", versao: "teste", vigenteDesde: new Date("2020-01-01") },
    });
    await salvarPolitica(prisma, { tenantId: tenant.id, escopo: "AGENT", escopoValor: "yalla", periodo: "DIARIO", limite: "0.0000001", actorType: "HUMANO", userId: admin.id });

    const conversationId = await criarConversaComMensagem("Quanto custa o pacote pro Marrocos, com todos os detalhes que eu puder pensar em escrever aqui pra gerar bastante texto de entrada?");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await gerarRespostaYalla(tenant.id, conversationId);
    expect(resposta).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    const gates = await withTenant(prisma, tenant.id, (tx) => tx.gate.findMany({ where: { tenantId: tenant.id, categoria: "FINANCEIRO" } }));
    expect(gates.length).toBeGreaterThan(0);
    expect(gates[0]!.status).toBe("PENDENTE");

    await prisma.modelPrice.deleteMany({ where: { provider: "anthropic" } });
  });
});

describe("Cost Control × Yalla — POST-RECORD usa o usage REAL devolvido pelo provider", () => {
  it("resposta do provider com usage: CostEvent grava os tokens reais, custo calculado, costKind ACTUAL (preço cadastrado)", async () => {
    await prisma.modelPrice.create({
      data: { provider: "anthropic", moeda: "USD", unidade: "token", precoEntrada: "0.000003", precoSaida: "0.000015", versao: "teste", vigenteDesde: new Date("2020-01-01") },
    });

    const conversationId = await criarConversaComMensagem("oi");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "Resposta real simulada." }], usage: { input_tokens: 123, output_tokens: 45 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await gerarRespostaYalla(tenant.id, conversationId);
    expect(resposta).toBe("Resposta real simulada.");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const eventos = await withTenant(prisma, tenant.id, (tx) => tx.costEvent.findMany({ where: { tenantId: tenant.id, source: "yalla" } }));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.inputTokens).toBe(123);
    expect(eventos[0]!.outputTokens).toBe(45);
    expect(eventos[0]!.costKind).toBe("ACTUAL");
    // 123*0.000003 + 45*0.000015 = 0.000369 + 0.000675 = 0.001044
    expect(eventos[0]!.custoTotal!.toString()).toBe("0.001044");
    expect(eventos[0]!.agent).toBe("yalla");

    await prisma.modelPrice.deleteMany({ where: { provider: "anthropic" } });
  });

  it("resposta do provider SEM usage (provider não informou): CostEvent grava costKind UNKNOWN, nunca custo 0 inventado", async () => {
    await prisma.modelPrice.create({
      data: { provider: "anthropic", moeda: "USD", unidade: "token", precoEntrada: "0.000003", precoSaida: "0.000015", versao: "teste", vigenteDesde: new Date("2020-01-01") },
    });

    const conversationId = await criarConversaComMensagem("oi de novo");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "Resposta sem usage." }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await gerarRespostaYalla(tenant.id, conversationId);
    expect(resposta).toBe("Resposta sem usage.");

    const eventos = await withTenant(prisma, tenant.id, (tx) => tx.costEvent.findMany({ where: { tenantId: tenant.id, source: "yalla" } }));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.costKind).toBe("UNKNOWN");
    expect(eventos[0]!.custoTotal).toBeNull();

    await prisma.modelPrice.deleteMany({ where: { provider: "anthropic" } });
  });

  it("metadata do CostEvent nunca contém a chave de API nem o texto completo do prompt/resposta", async () => {
    const conversationId = await criarConversaComMensagem("mensagem de teste pra checar metadata");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "Resposta X." }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await gerarRespostaYalla(tenant.id, conversationId);

    const eventos = await withTenant(prisma, tenant.id, (tx) => tx.costEvent.findMany({ where: { tenantId: tenant.id, source: "yalla" } }));
    const serializado = JSON.stringify(eventos[0]!.metadata);
    expect(serializado).not.toContain("sk-teste-cost-yalla");
    expect(serializado).not.toContain("mensagem de teste pra checar metadata");
    expect(serializado).not.toContain("Resposta X.");
  });
});
