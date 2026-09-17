import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, withSystem, withTenant } from "@partiumarrocos/db";
import { garantirPermissoes } from "../helpers/garantir-permissoes";

/**
 * PM-BLOQ-001 — prova de que a fiação real (ai.ts/whatsapp.ts/yalla.ts) usa
 * o SecretProvider de ponta a ponta: RBAC protege escrita, a chave nunca
 * aparece no retorno pro cliente, e o Yalla só chama o provedor de IA com a
 * chave já decifrada no momento exato do uso — nunca antes, nunca logada.
 * `fetch` é mockado (nunca chama IA/WhatsApp real de verdade — não é
 * autorizado nesta rodada gastar chamada paga nem depender de rede).
 */
const mockRequireAuthContext = vi.fn();
vi.mock("@/lib/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/session")>();
  return { ...actual, requireAuthContext: () => mockRequireAuthContext() };
});
// revalidatePath só funciona dentro de uma request real do Next.js — as
// actions chamam no fim de toda escrita; sem isto o teste quebraria por um
// detalhe de infraestrutura de rota, não por causa do SecretProvider.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { salvarConfigIA, desligarIA, removerChaveIA } = await import("@/app/actions/ai");
const { salvarContaWhatsapp, responderWhatsapp } = await import("@/app/actions/whatsapp");
const { gerarRespostaYalla } = await import("@/lib/ai/yalla");
const { ForbiddenError } = await import("@/lib/rbac");

let tenant: { id: string };
let admin: { id: string; email: string };

function ctx(tenantId: string, chaves: string[]) {
  return { sessionId: "s1", user: { id: admin.id, email: admin.email, mustChangePassword: false }, tenantId, role: null, permissions: new Set(chaves) };
}

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (secret wiring teste)", slug: `sw-${Date.now()}` } });
  await garantirPermissoes(prisma);
  admin = await prisma.user.create({ data: { email: `secret-wiring-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenant.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: admin.id, tenantId: tenant.id, roleId: role.id } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenant.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(() => {
  vi.unstubAllGlobals();
  mockRequireAuthContext.mockReset();
});

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("RBAC — configurar segredo exige whatsapp.manage", () => {
  it("salvarConfigIA sem whatsapp.manage é rejeitado (ForbiddenError), nada é escrito", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["leads.view"]));
    await expect(salvarConfigIA(formData({ provider: "anthropic", apiKey: "sk-nao-deveria-salvar" }))).rejects.toThrow(ForbiddenError);

    const t = await withTenant(prisma, tenant.id, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenant.id } }));
    expect(t.aiApiKeySecretRef).toBeNull();
  });

  it("salvarContaWhatsapp sem whatsapp.manage é rejeitado", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["leads.view"]));
    await expect(
      salvarContaWhatsapp(formData({ label: "x", phoneNumberId: "pnid-x", accessToken: "tok", verifyToken: "vt" })),
    ).rejects.toThrow(ForbiddenError);
  });

  it("removerChaveIA sem whatsapp.manage é rejeitado", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["leads.view"]));
    await expect(removerChaveIA()).rejects.toThrow(ForbiddenError);
  });
});

describe("ai.ts — a chave nunca volta no retorno da action (UI é write-only)", () => {
  it("salvarConfigIA devolve só {ok:true} — nenhuma chave, nenhum secretRef", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["whatsapp.manage"]));
    const res = await salvarConfigIA(formData({ provider: "anthropic", apiKey: "sk-primeira-chave-config" }));
    expect(res).toEqual({ ok: true });
    expect(Object.keys(res)).not.toContain("apiKey");
  });
});

describe("Yalla — usa a chave real só no momento do uso, via fetch mockado (nunca uma chamada paga de verdade)", () => {
  it("configura chave → gerarRespostaYalla decifra e chama o provedor com a chave certa no header", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["whatsapp.manage"]));
    const chaveReal = "sk-ant-chave-real-de-teste-nao-e-producao";
    await salvarConfigIA(formData({ provider: "anthropic", apiKey: chaveReal }));

    const contato = await withTenant(prisma, tenant.id, (tx) => tx.contact.create({ data: { tenantId: tenant.id, nome: "Contato Yalla" } }));
    const conversa = await withTenant(prisma, tenant.id, (tx) => tx.conversation.create({ data: { tenantId: tenant.id, contactId: contato.id, channel: "WHATSAPP" } }));
    await withTenant(prisma, tenant.id, (tx) =>
      tx.message.create({ data: { tenantId: tenant.id, conversationId: conversa.id, direction: "ENTRADA", senderType: "CONTATO", conteudo: "Oi, quanto custa o pacote pro Marrocos?" } }),
    );

    let headerRecebido: string | null = null;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      headerRecebido = (init.headers as Record<string, string>)["x-api-key"] ?? null;
      return new Response(JSON.stringify({ content: [{ type: "text", text: "Resposta simulada do Yalla." }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await gerarRespostaYalla(tenant.id, conversa.id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headerRecebido).toBe(chaveReal); // prova que a chave decifrada de verdade chegou até a chamada
    expect(resposta).toBe("Resposta simulada do Yalla.");
  });

  it("SECRET_ACCESS_FAILED (provider indisponível): Yalla nunca cai pra texto plano nem chama a IA — fail-closed, sem nenhuma chamada de rede", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["whatsapp.manage"]));
    await salvarConfigIA(formData({ provider: "anthropic", apiKey: "sk-chave-que-nao-sera-usada" }));

    const contato = await withTenant(prisma, tenant.id, (tx) => tx.contact.create({ data: { tenantId: tenant.id, nome: "Contato Yalla 2" } }));
    const conversa = await withTenant(prisma, tenant.id, (tx) => tx.conversation.create({ data: { tenantId: tenant.id, contactId: contato.id, channel: "WHATSAPP" } }));
    await withTenant(prisma, tenant.id, (tx) =>
      tx.message.create({ data: { tenantId: tenant.id, conversationId: conversa.id, direction: "ENTRADA", senderType: "CONTATO", conteudo: "oi" } }),
    );

    const masterKeyOriginal = process.env.SECRET_PROVIDER_MASTER_KEY;
    delete process.env.SECRET_PROVIDER_MASTER_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const resposta = await gerarRespostaYalla(tenant.id, conversa.id);
      expect(resposta).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled(); // nunca tenta a IA sem conseguir a chave de verdade
    } finally {
      if (masterKeyOriginal !== undefined) process.env.SECRET_PROVIDER_MASTER_KEY = masterKeyOriginal;
    }
  });

  it("removerChaveIA: depois de removida, Yalla volta a ficar silencioso (sem chave, sem chamada de rede)", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["whatsapp.manage"]));
    await salvarConfigIA(formData({ provider: "anthropic", apiKey: "sk-chave-a-ser-removida" }));
    await removerChaveIA();

    const t = await withTenant(prisma, tenant.id, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenant.id } }));
    expect(t.aiApiKeySecretRef).toBeNull();
    expect(t.aiProvider).toBeNull();

    const contato = await withTenant(prisma, tenant.id, (tx) => tx.contact.create({ data: { tenantId: tenant.id, nome: "Contato pós-remoção" } }));
    const conversa = await withTenant(prisma, tenant.id, (tx) => tx.conversation.create({ data: { tenantId: tenant.id, contactId: contato.id, channel: "WHATSAPP" } }));
    await withTenant(prisma, tenant.id, (tx) =>
      tx.message.create({ data: { tenantId: tenant.id, conversationId: conversa.id, direction: "ENTRADA", senderType: "CONTATO", conteudo: "oi de novo" } }),
    );

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const resposta = await gerarRespostaYalla(tenant.id, conversa.id);
    expect(resposta).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("whatsapp.ts — accessToken/appSecret nunca gravados em texto plano, responderWhatsapp usa o valor decifrado", () => {
  it("salvarContaWhatsapp grava secretRef, não o token; salvar de novo rotaciona (mesma conta, novo valor)", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["whatsapp.manage"]));
    const phoneNumberId = `pnid-wiring-${Date.now()}`;

    await salvarContaWhatsapp(formData({ label: "Conta 1", phoneNumberId, accessToken: "tok-v1", appSecret: "app-v1", verifyToken: "verify-1" }));
    const contaV1 = await withTenant(prisma, tenant.id, (tx) => tx.whatsappAccount.findFirstOrThrow({ where: { tenantId: tenant.id, phoneNumberId } }));
    expect(contaV1.accessTokenSecretRef).toBeTruthy();

    await salvarContaWhatsapp(formData({ label: "Conta 1", phoneNumberId, accessToken: "tok-v2", appSecret: "app-v2", verifyToken: "verify-1" }));
    const contaV2 = await withTenant(prisma, tenant.id, (tx) => tx.whatsappAccount.findFirstOrThrow({ where: { tenantId: tenant.id, phoneNumberId } }));
    expect(contaV2.accessTokenSecretRef).toBe(contaV1.accessTokenSecretRef); // rotação mantém o mesmo secretRef

    const eventos = await withTenant(prisma, tenant.id, (tx) => tx.auditLog.findMany({ where: { tenantId: tenant.id, entidadeId: contaV1.accessTokenSecretRef! } }));
    expect(eventos.map((e) => e.acao).sort()).toEqual(["SECRET_CONFIGURED", "SECRET_ROTATED"]);
  });

  it("responderWhatsapp envia com o access token decifrado (via fetch mockado, nunca WhatsApp real)", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["whatsapp.manage"]));
    const phoneNumberId = `pnid-responder-${Date.now()}`;
    await salvarContaWhatsapp(formData({ label: "Conta responder", phoneNumberId, accessToken: "tok-para-responder", verifyToken: `verify-responder-${Date.now()}` }));
    const conta = await withTenant(prisma, tenant.id, (tx) => tx.whatsappAccount.findFirstOrThrow({ where: { tenantId: tenant.id, phoneNumberId } }));

    const contato = await withTenant(prisma, tenant.id, (tx) => tx.contact.create({ data: { tenantId: tenant.id, nome: "Contato responder", telefone: "5521999998888" } }));
    const conversa = await withTenant(prisma, tenant.id, (tx) =>
      tx.conversation.create({ data: { tenantId: tenant.id, contactId: contato.id, accountId: conta.id, channel: "WHATSAPP" } }),
    );

    let authHeaderRecebido: string | null = null;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      authHeaderRecebido = (init.headers as Record<string, string>).Authorization ?? null;
      return new Response(JSON.stringify({ messages: [{ id: "wamid.teste" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["atendimento.manage"]));
    const resultado = await responderWhatsapp(conversa.id, formData({ texto: "resposta manual do operador" }));

    expect(resultado.ok).toBe(true);
    expect(authHeaderRecebido).toBe("Bearer tok-para-responder");
  });
});
