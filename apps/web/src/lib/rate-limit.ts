// PM-PRE-GOLIVE-MASTER-01, §9 — achado real de auditoria (PM-CONV-11):
// o limitador em memória (Map por processo) não é seguro sob múltiplas
// instâncias Vercel — cada instância tinha seu próprio contador,
// tornando o limite "por IP" na prática só "por IP por instância".
// Substituído pelo limitador atômico em Postgres
// (`packages/db/src/rate-limit.ts::verificarLimiteTaxa`, testado com
// concorrência real — ver `pm-pre-golive-rate-limit.test.ts`) — nunca
// depende de estado local, funciona igual com 1 ou N instâncias.
import { prisma, verificarLimiteTaxa, type ResultadoLimiteTaxa } from "@partiumarrocos/db";

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<ResultadoLimiteTaxa> {
  return verificarLimiteTaxa(prisma, key, limit, windowMs);
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Mesma extração de IP, mas para dentro de uma Server Action/Server Component (sem `Request` — usa `next/headers`). */
export async function getClientIpFromRequestHeaders(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}
