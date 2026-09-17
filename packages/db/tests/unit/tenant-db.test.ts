import { describe, expect, it } from "vitest";
import { withTenant } from "../../src/tenant-db";
import type { PrismaClient } from "@prisma/client";

describe("withTenant", () => {
  it("recusa executar sem um tenantId", async () => {
    const fakePrisma = {} as PrismaClient;
    await expect(withTenant(fakePrisma, "", async () => "nunca chega aqui")).rejects.toThrow(
      /tenantId vazio/,
    );
  });
});
