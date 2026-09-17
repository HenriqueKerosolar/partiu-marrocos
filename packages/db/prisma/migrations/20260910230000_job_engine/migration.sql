-- T5 (Job/Execution Engine) — passo 1/2: schema aditivo, nenhuma tabela
-- existente tocada. RLS + append-only condicional (passo 2) vem na migration
-- seguinte, mesmo padrão de T1/PM-BLOQ-001/T2/T3.

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'READY', 'RUNNING', 'BLOCKED', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'READY',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "idempotency_key" TEXT,
    "scheduled_for" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "depends_on_job_id" TEXT,
    "gate_id" TEXT,
    "blocked_reason" TEXT,
    "resume_state" "JobStatus",
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "last_error" TEXT,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "ExecutionStatus" NOT NULL,
    "worker_id" TEXT NOT NULL,
    "lease_expires_at" TIMESTAMP(3) NOT NULL,
    "heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "resultado" JSONB,
    "duracao_ms" INTEGER,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_tenant_id_idx" ON "jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "jobs_status_scheduled_for_idx" ON "jobs"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "jobs_tenant_id_type_idx" ON "jobs"("tenant_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_tenant_id_idempotency_key_key" ON "jobs"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_tenant_id_id_key" ON "jobs"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "executions_tenant_id_idx" ON "executions"("tenant_id");

-- CreateIndex
CREATE INDEX "executions_tenant_id_job_id_idx" ON "executions"("tenant_id", "job_id");

-- CreateIndex
CREATE UNIQUE INDEX "executions_tenant_id_id_key" ON "executions"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_depends_on_job_id_fkey" FOREIGN KEY ("tenant_id", "depends_on_job_id") REFERENCES "jobs"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_tenant_id_job_id_fkey" FOREIGN KEY ("tenant_id", "job_id") REFERENCES "jobs"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

