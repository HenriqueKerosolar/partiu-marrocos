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
});
