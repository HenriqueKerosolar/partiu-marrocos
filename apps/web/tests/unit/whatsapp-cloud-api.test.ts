import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";
import { assinaturaValida } from "../../src/lib/whatsapp/cloud-api";

const SECRET = "segredo-de-teste-do-app-whatsapp";

function assinar(raw: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
}

describe("assinaturaValida (HMAC do webhook WhatsApp)", () => {
  it("aceita uma assinatura correta", async () => {
    const raw = JSON.stringify({ hello: "world" });
    const header = assinar(raw, SECRET);
    await expect(assinaturaValida(raw, header, SECRET)).resolves.toBe(true);
  });

  it("rejeita uma assinatura de outro segredo", async () => {
    const raw = JSON.stringify({ hello: "world" });
    const header = assinar(raw, "outro-segredo-qualquer");
    await expect(assinaturaValida(raw, header, SECRET)).resolves.toBe(false);
  });

  it("rejeita corpo adulterado (mesma assinatura, payload diferente)", async () => {
    const raw = JSON.stringify({ hello: "world" });
    const header = assinar(raw, SECRET);
    const adulterado = JSON.stringify({ hello: "world!" });
    await expect(assinaturaValida(adulterado, header, SECRET)).resolves.toBe(false);
  });

  it("rejeita quando não há header de assinatura, mesmo com secret configurado", async () => {
    const raw = JSON.stringify({ hello: "world" });
    await expect(assinaturaValida(raw, null, SECRET)).resolves.toBe(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sem secret configurado: NÃO libera em produção (achado real da auditoria KeroSolar — nunca repetir)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const raw = JSON.stringify({ hello: "world" });
    await expect(assinaturaValida(raw, null, null)).resolves.toBe(false);
  });

  it("sem secret configurado: libera fora de produção (modo teste local)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const raw = JSON.stringify({ hello: "world" });
    await expect(assinaturaValida(raw, null, null)).resolves.toBe(true);
  });
});
