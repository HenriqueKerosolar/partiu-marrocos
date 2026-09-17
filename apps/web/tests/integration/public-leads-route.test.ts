import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma, withSystem, withTenant } from "@partiumarrocos/db";
import { POST, OPTIONS } from "@/app/api/public/leads/route";

/**
 * Resolve o achado CRÍTICO da primeira auditoria do Partiu Marrocos: o
 * formulário do site atual só abre o WhatsApp, sem gravar o lead antes. Esta
 * rota é o backend que o site público (fora deste repo) deve chamar primeiro.
 */
let tenant: { id: string; slug: string };

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (rota lead público teste)", slug: `pub-lead-${Date.now()}` } });
  await withTenant(prisma, tenant.id, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId: tenant.id, nome: "Funil", isDefault: true } });
    await tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Novo lead", ordem: 0 } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenant.id } }));
  await prisma.$disconnect();
}, 30000);

function request(body: unknown, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/public/leads", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/leads", () => {
  it("com dados válidos, cria contato + lead e retorna 201", async () => {
    const res = await POST(request({ tenantSlug: tenant.slug, nome: "Visitante Teste", telefone: "5521999990000", origem: "landing-page" }, "203.0.113.10"));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.leadId).toBeDefined();

    const lead = await withTenant(prisma, tenant.id, (tx) => tx.lead.findUnique({ where: { id: json.leadId }, include: { contact: true } }));
    expect(lead?.contact.nome).toBe("Visitante Teste");
    expect(lead?.contact.telefone).toBe("5521999990000");
  });

  it("mesmo telefone de novo: reaproveita o contato (dedup), cria um lead novo", async () => {
    const primeira = await POST(request({ tenantSlug: tenant.slug, nome: "Repetido", telefone: "5521988880000" }, "203.0.113.11"));
    const segunda = await POST(request({ tenantSlug: tenant.slug, nome: "Repetido de novo", telefone: "5521988880000" }, "203.0.113.11"));
    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(201);

    const j1 = await primeira.json();
    const j2 = await segunda.json();
    const [l1, l2] = await withTenant(prisma, tenant.id, (tx) =>
      Promise.all([tx.lead.findUnique({ where: { id: j1.leadId } }), tx.lead.findUnique({ where: { id: j2.leadId } })]),
    );
    expect(l1?.contactId).toBe(l2?.contactId);
    expect(l1?.id).not.toBe(l2?.id);
  });

  it("sem tenantSlug, rejeita com 400", async () => {
    const res = await POST(request({ nome: "X", telefone: "5521999990000" }, "203.0.113.12"));
    expect(res.status).toBe(400);
  });

  it("tenantSlug de empresa inexistente, rejeita com 404 (não vaza detalhe do erro)", async () => {
    const res = await POST(request({ tenantSlug: "empresa-que-nao-existe", nome: "X", telefone: "5521999990000" }, "203.0.113.13"));
    expect(res.status).toBe(404);
  });

  it("telefone claramente inválido (menos de 8 dígitos), rejeita com 400", async () => {
    const res = await POST(request({ tenantSlug: tenant.slug, nome: "X", telefone: "123" }, "203.0.113.14"));
    expect(res.status).toBe(400);
  });

  it("corpo que não é JSON válido é rejeitado com 400, não derruba a rota", async () => {
    const req = new NextRequest("http://localhost/api/public/leads", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.15" },
      body: "isso não é json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rate limit por IP: a 11ª tentativa na mesma janela é rejeitada com 429", async () => {
    const ip = "203.0.113.99";
    let ultimaResposta: Response | undefined;
    for (let i = 0; i < 11; i++) {
      ultimaResposta = await POST(request({ tenantSlug: tenant.slug, nome: `Flood ${i}`, telefone: `55219999900${String(i).padStart(2, "0")}` }, ip));
    }
    expect(ultimaResposta?.status).toBe(429);
  });

  describe("Attribution (T6) — captura de UTM/gclid/fbclid junto com o lead", () => {
    it("com parâmetros de atribuição, grava um AttributionTouch ligado ao Contact e ao Lead", async () => {
      const res = await POST(
        request(
          {
            tenantSlug: tenant.slug, nome: "Visitante Ads", telefone: "5521999991111",
            utmSource: "google", utmMedium: "cpc", utmCampaign: "marrocos-black-friday",
            gclid: "abc123", landingPage: "https://partiumarrocos.com.br/?utm_source=google", referrer: "https://google.com",
          },
          "203.0.113.30",
        ),
      );
      expect(res.status).toBe(201);
      const { leadId } = await res.json();

      const touch = await withTenant(prisma, tenant.id, (tx) => tx.attributionTouch.findFirst({ where: { leadId } }));
      expect(touch).not.toBeNull();
      expect(touch?.source).toBe("google");
      expect(touch?.medium).toBe("cpc");
      expect(touch?.campaign).toBe("marrocos-black-friday");
      expect(touch?.gclid).toBe("abc123");
      expect(touch?.tipo).toBe("CONVERSION");
    });

    it("sem NENHUM parâmetro de atribuição, não grava linha nenhuma (nunca um AttributionTouch vazio)", async () => {
      const res = await POST(request({ tenantSlug: tenant.slug, nome: "Visitante Orgânico", telefone: "5521999992222" }, "203.0.113.31"));
      expect(res.status).toBe(201);
      const { leadId } = await res.json();

      const touch = await withTenant(prisma, tenant.id, (tx) => tx.attributionTouch.findFirst({ where: { leadId } }));
      expect(touch).toBeNull();
    });

    it("lead continua sendo criado normalmente mesmo com atribuição ausente — nunca bloqueia o fluxo crítico", async () => {
      const res = await POST(request({ tenantSlug: tenant.slug, nome: "Visitante Sem Ads", telefone: "5521999993333", utmSource: "", utmCampaign: "   " }, "203.0.113.32"));
      expect(res.status).toBe(201);
    });
  });

  describe("CORS — o site público chama esta rota de outro domínio", () => {
    it("OPTIONS (preflight) devolve 204 com os cabeçalhos de CORS", async () => {
      const res = OPTIONS();
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });

    it("toda resposta de POST (sucesso e erro) carrega Access-Control-Allow-Origin", async () => {
      const sucesso = await POST(request({ tenantSlug: tenant.slug, nome: "Cors Ok", telefone: "5521999990099" }, "203.0.113.20"));
      expect(sucesso.headers.get("Access-Control-Allow-Origin")).toBeTruthy();

      const erro = await POST(request({ nome: "Sem tenant" }, "203.0.113.21"));
      expect(erro.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
    });
  });
});
