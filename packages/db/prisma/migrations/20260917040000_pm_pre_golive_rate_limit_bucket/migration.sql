-- PM-PRE-GOLIVE-MASTER-01, §9 — rate limiter atômico em Postgres,
-- multi-instância-safe. Puramente aditiva (1 tabela nova). Sem RLS de
-- propósito (mesmo tratamento de worker_heartbeats): `key` é opaca,
-- composta pelo chamador, nunca dado de negócio de um tenant.

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_ms" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex — usado pela varredura de limpeza de buckets expirados.
CREATE INDEX "rate_limit_buckets_window_start_idx" ON "rate_limit_buckets"("window_start");
