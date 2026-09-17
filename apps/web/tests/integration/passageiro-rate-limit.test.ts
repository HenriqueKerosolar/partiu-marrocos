import { describe, expect, it, vi } from "vitest";

/**
 * PM-CONV-11 — achado real de auditoria de segurança: /minha-viagem (rota
 * pública, credencial via ?token=) não tinha nenhum rate limit, ao
 * contrário de /api/auth/login e /api/public/leads (mesmo helper
 * `rateLimit`, já testado nelas — ver public-leads-route.test.ts). Prova
 * aqui que a Server Action `obterMinhaViagemAction` agora usa a mesma
 * proteção.
 */
let ipAtual = "198.51.100.1";
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (nome: string) => (nome === "x-forwarded-for" ? ipAtual : null) }),
}));

const { obterMinhaViagemAction } = await import("@/app/actions/passageiro");

describe("obterMinhaViagemAction — rate limit por IP", () => {
  it("a 21ª tentativa na mesma janela é rejeitada, mesmo com token inválido em todas", async () => {
    ipAtual = `198.51.100.${Math.floor(Math.random() * 250) + 1}`; // IP só desta execução — nunca colide com outro teste no mesmo processo
    let ultima: { ok?: boolean; error?: string } | undefined;
    for (let i = 0; i < 21; i++) {
      ultima = await obterMinhaViagemAction("a".repeat(48));
    }
    expect(ultima?.error).toBe("Muitas tentativas — aguarde alguns minutos e tente novamente.");
  });

  it("IP diferente não é afetado pelo limite do outro", async () => {
    ipAtual = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    const r = await obterMinhaViagemAction("a".repeat(48));
    expect(r.error).not.toBe("Muitas tentativas — aguarde alguns minutos e tente novamente.");
  });
});
