// Limitador simples em memória, por instância — protege contra força bruta
// em login sem precisar de infraestrutura extra. Em produção com múltiplas
// instâncias, trocar o Map por um store compartilhado (Redis) atrás da mesma
// função `rateLimit`. Porte do fabricaease.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Varre buckets expirados periodicamente para não crescer sem limite.
// unref() evita que isso prenda o processo vivo (ex.: em scripts/testes).
const sweepInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  },
  5 * 60_000,
);
sweepInterval.unref?.();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
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
