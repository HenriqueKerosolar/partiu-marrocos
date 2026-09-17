import { describe, expect, it } from "vitest";
import { hasPermission, requirePermission, ForbiddenError } from "../../src/lib/rbac";
import type { AuthContext } from "../../src/lib/session";

function makeCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    sessionId: "sess_1",
    user: { id: "user_1", email: "a@b.com", mustChangePassword: false },
    tenantId: "tenant_1",
    role: { id: "role_1", nome: "Vendas" },
    permissions: new Set(["leads.view"]),
    ...overrides,
  };
}

describe("rbac", () => {
  it("nega por padrão quando a permissão não foi concedida", () => {
    const ctx = makeCtx();
    expect(hasPermission(ctx, "leads.manage")).toBe(false);
  });

  it("permite quando a permissão está no conjunto do papel", () => {
    const ctx = makeCtx();
    expect(hasPermission(ctx, "leads.view")).toBe(true);
  });

  it("nega mesmo com a permissão no conjunto se não houver tenant selecionado", () => {
    const ctx = makeCtx({ tenantId: null, permissions: new Set(["leads.view"]) });
    expect(hasPermission(ctx, "leads.view")).toBe(false);
  });

  it("requirePermission lança ForbiddenError quando negado", () => {
    const ctx = makeCtx();
    expect(() => requirePermission(ctx, "leads.manage")).toThrow(ForbiddenError);
  });

  it("requirePermission não lança quando permitido", () => {
    const ctx = makeCtx();
    expect(() => requirePermission(ctx, "leads.view")).not.toThrow();
  });
});
