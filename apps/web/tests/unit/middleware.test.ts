import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

/**
 * Achado real desta rodada: até esta correção, TODA chamada sob
 * /api/public/* (inclusive o preflight OPTIONS de CORS) era rejeitada com
 * 401 por este middleware — mesmo a própria rota (POST /api/public/leads)
 * já tendo sido escrita como pública/sem sessão. O teste de
 * public-leads-route.test.ts nunca pegou isso porque chama a função `POST`
 * exportada diretamente, sem passar pelo middleware — só um teste do
 * middleware em si prova isso.
 */
describe("middleware — rotas públicas (sem sessão)", () => {
  it("POST /api/public/leads passa sem sessão (nunca 401 antes de chegar na rota)", async () => {
    const req = new NextRequest("http://localhost/api/public/leads", { method: "POST" });
    const res = await middleware(req);
    expect(res.status).not.toBe(401);
  });

  it("OPTIONS /api/public/leads (preflight de CORS) também passa sem sessão", async () => {
    const req = new NextRequest("http://localhost/api/public/leads", { method: "OPTIONS" });
    const res = await middleware(req);
    expect(res.status).not.toBe(401);
  });

  it("uma rota autenticada qualquer (ex.: /api/leads, se existisse) continua exigindo sessão — /api/public/* não abre tudo", async () => {
    const req = new NextRequest("http://localhost/api/rota-privada-qualquer/algo", { method: "GET" });
    const res = await middleware(req);
    expect(res.status).toBe(401);
  });

  it("uma página autenticada (ex.: /dashboard) sem sessão redireciona pro /login, não 401", async () => {
    const req = new NextRequest("http://localhost/dashboard", { method: "GET" });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  /**
   * PM-PRE-GOLIVE-MASTER-01 — achado real em produção, mesma classe do
   * achado de /api/public/* acima: /api/health e /api/webhooks/* já eram
   * escritos como públicos (sem `requireAuthContext`/verificação própria de
   * assinatura), mas o middleware devolvia 401 antes de chegar neles. Só
   * apareceu numa chamada real sem sessão (monitor externo, ou a própria
   * Meta batendo no webhook) — todo teste anterior tinha sessão válida.
   */
  it("GET /api/health passa sem sessão (endpoint de monitoramento externo)", async () => {
    const req = new NextRequest("http://localhost/api/health", { method: "GET" });
    const res = await middleware(req);
    expect(res.status).not.toBe(401);
  });

  it("GET /api/webhooks/whatsapp passa sem sessão (a Meta nunca envia cookie de sessão)", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/whatsapp", { method: "GET" });
    const res = await middleware(req);
    expect(res.status).not.toBe(401);
  });

  /**
   * A home pública ("/") virou uma página de verdade do app (não mais
   * redirect pro /dashboard) — um visitante anônimo precisa conseguir vê-la
   * sem sessão.
   */
  it("GET / (home pública) passa sem sessão", async () => {
    const req = new NextRequest("http://localhost/", { method: "GET" });
    const res = await middleware(req);
    expect(res.status).not.toBe(307);
  });

  it("GET /img/logo.png (foto do site público) passa sem sessão", async () => {
    const req = new NextRequest("http://localhost/img/logo.png", { method: "GET" });
    const res = await middleware(req);
    expect(res.status).not.toBe(307);
  });

  it.each(["/universo-amazigh", "/sabores-do-marrocos"])(
    "GET %s (página do site público) passa sem sessão",
    async (pathname) => {
      const req = new NextRequest(`http://localhost${pathname}`, { method: "GET" });
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
    },
  );

  it("GET /data/geo.json (dados do mapa de roteiro do site público) passa sem sessão", async () => {
    const req = new NextRequest("http://localhost/data/geo.json", { method: "GET" });
    const res = await middleware(req);
    expect(res.status).not.toBe(307);
  });
});
