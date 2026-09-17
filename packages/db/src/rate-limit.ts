import type { PrismaClient } from "@prisma/client";

/**
 * PM-PRE-GOLIVE-MASTER-01, §9 — rate limiter atômico em Postgres.
 * Substitui o `Map` em memória de `apps/web/src/lib/rate-limit.ts`
 * (documentado desde o PM-CONV-11 como não seguro sob múltiplas
 * instâncias — cada instância Vercel teria seu próprio contador).
 *
 * Atomicidade via `INSERT...ON CONFLICT...DO UPDATE...RETURNING` — mesmo
 * padrão já comprovado em `cost-control.ts::ajustarCostUsage` e
 * `tools/broker.ts::reservarToolCall`. Postgres serializa o UPDATE de uma
 * mesma linha (lock implícito de row), então duas chamadas concorrentes
 * pra MESMA `key` nunca perdem um incremento (testado com concorrência
 * real, não só assumido) — nunca "leia, some em JS, escreva" (que teria
 * exatamente a mesma classe de race condition que uma implementação em
 * memória sob múltiplas instâncias).
 *
 * Reset de janela é decidido dentro do MESMO UPDATE atômico (não uma
 * leitura seguida de decisão em JS) — `window_start + window_ms <= now()`
 * reinicia pra `count=1`/`window_start=now()`; senão incrementa.
 */

export interface ResultadoLimiteTaxa {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export async function verificarLimiteTaxa(prisma: PrismaClient, chave: string, limite: number, janelaMs: number): Promise<ResultadoLimiteTaxa> {
  // Sem RLS nesta tabela (chave opaca, nunca dado de tenant) — mesmo
  // tratamento de `WorkerHeartbeat` (ver `registrarHeartbeatWorker`,
  // jobs/engine.ts): chama `prisma` direto, sem `withTenant`/`withSystem`.
  // Um único statement INSERT...ON CONFLICT já é atômico por si só — não
  // precisa de transação explícita em volta.
  const linhas = await prisma.$queryRaw<{ count: number; window_start: Date }[]>`
    INSERT INTO rate_limit_buckets (key, count, window_start, window_ms, updated_at)
    VALUES (${chave}, 1, now(), ${janelaMs}, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit_buckets.window_start + (rate_limit_buckets.window_ms || ' milliseconds')::interval <= now()
        THEN 1
        ELSE rate_limit_buckets.count + 1
      END,
      window_start = CASE
        WHEN rate_limit_buckets.window_start + (rate_limit_buckets.window_ms || ' milliseconds')::interval <= now()
        THEN now()
        ELSE rate_limit_buckets.window_start
      END,
      window_ms = ${janelaMs},
      updated_at = now()
    RETURNING count, window_start
  `;
  const linha = linhas[0]!;
  const count = Number(linha.count);

  // Limpeza preguiçosa/probabilística — nunca em toda chamada (custaria uma
  // query extra por request), mas com frequência real proporcional ao
  // tráfego (mais checagens de rate limit = mais chances de limpar).
  // Deliberadamente NÃO usa o Job Engine (T5): diferente de
  // `geolocation.purgar_pings_antigos` (PM-CONV-06 §4E), esta tabela não
  // pertence a nenhum tenant — forçar essa limpeza a "pertencer" a um
  // tenant qualquer pra caber no motor (que exige `Job.tenantId`) seria
  // artificial. Mesmo padrão de limpeza preguiçosa já usado por outros
  // sistemas de rate-limit/sessão (ex.: Django) — sem cron novo, sem
  // acoplamento a nenhum tenant específico.
  if (Math.random() < 0.001) void purgarBucketsExpirados(prisma).catch(() => {});

  if (count > limite) {
    const resetEm = linha.window_start.getTime() + janelaMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetEm - Date.now()) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true };
}

/**
 * Limpeza — buckets cuja janela expirou há mais de `margemMs` (folga
 * generosa, não precisa ser exata: um bucket "velho" não atrapalha nada
 * até que a mesma `key` apareça de novo, momento em que o UPSERT acima já
 * reinicia a janela sozinho). Nunca remove um bucket cuja janela ainda
 * está ativa, mesmo que `count` esteja zerado.
 */
export async function purgarBucketsExpirados(prisma: PrismaClient, margemMs = 24 * 60 * 60 * 1000): Promise<number> {
  const limite = new Date(Date.now() - margemMs);
  const r = await prisma.$executeRaw`
    DELETE FROM rate_limit_buckets
    WHERE window_start + (window_ms || ' milliseconds')::interval <= ${limite}
  `;
  return Number(r);
}
