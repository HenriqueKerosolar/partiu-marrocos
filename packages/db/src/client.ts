import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __partiumarrocosPrisma: PrismaClient | undefined;
}

// Uma única role/conexão para migrations e runtime (mesmo padrão do
// CongáOne/MercadoEase) — o isolamento não depende de qual role está
// conectada, e sim do contexto de tenant setado por request via
// withTenant()/withSystem() (ver tenant-db.ts e prisma/rls.sql).
function createClient(): PrismaClient {
  return new PrismaClient();
}

// Singleton para evitar exaurir conexões em dev (hot reload do Next.js).
export const prisma = globalThis.__partiumarrocosPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__partiumarrocosPrisma = prisma;
}

export * from "@prisma/client";
