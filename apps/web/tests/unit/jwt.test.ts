import { describe, expect, it, beforeAll } from "vitest";
import { signSessionToken, verifySessionToken } from "../../src/lib/jwt";

beforeAll(() => {
  process.env.JWT_SECRET ??= "segredo-de-teste-bem-longo-para-hs256";
});

describe("jwt", () => {
  it("assina e verifica um token válido", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const token = await signSessionToken({ sid: "sess_1", uid: "user_1" }, expiresAt);
    const claims = await verifySessionToken(token);
    expect(claims).toMatchObject({ sid: "sess_1", uid: "user_1" });
  });

  it("rejeita um token expirado", async () => {
    const expiresAt = new Date(Date.now() - 1000);
    const token = await signSessionToken({ sid: "sess_1", uid: "user_1" }, expiresAt);
    const claims = await verifySessionToken(token);
    expect(claims).toBeNull();
  });

  it("rejeita um token adulterado", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const token = await signSessionToken({ sid: "sess_1", uid: "user_1" }, expiresAt);
    const adulterado = token.slice(0, -2) + "xx";
    const claims = await verifySessionToken(adulterado);
    expect(claims).toBeNull();
  });

  it("rejeita payload sem sid/uid", async () => {
    const claims = await verifySessionToken("token.invalido.aqui");
    expect(claims).toBeNull();
  });
});
