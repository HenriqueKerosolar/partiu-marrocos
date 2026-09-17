-- T3 (Tool Broker) — passo 1/2: schema aditivo. `leads.preferencias_cliente`
-- é a única coluna tocada numa tabela existente (nullable, aditiva); tudo o
-- mais é tabela nova. RLS (passo 2) vem na migration seguinte, mesmo padrão
-- de T1/PM-BLOQ-001/T2.

-- CreateEnum
CREATE TYPE "ToolRisk" AS ENUM ('READ_ONLY', 'SAFE_WRITE', 'PRIVILEGED_WRITE', 'EXTERNAL_SIDE_EFFECT', 'FINANCIAL');

-- CreateEnum
CREATE TYPE "ToolCallStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED', 'TIMEOUT');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "preferencias_cliente" JSONB;

-- CreateTable
CREATE TABLE "agent_grants" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_calls" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tool_call_id" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "risk" "ToolRisk" NOT NULL,
    "status" "ToolCallStatus" NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "resultado" JSONB,
    "erro" TEXT,
    "duracao_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_grants_tenant_id_idx" ON "agent_grants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_grants_tenant_id_agent_capability_key" ON "agent_grants"("tenant_id", "agent", "capability");

-- CreateIndex
CREATE INDEX "tool_calls_tenant_id_idx" ON "tool_calls"("tenant_id");

-- CreateIndex
CREATE INDEX "tool_calls_tenant_id_tool_id_idx" ON "tool_calls"("tenant_id", "tool_id");

-- CreateIndex
CREATE UNIQUE INDEX "tool_calls_tenant_id_tool_call_id_key" ON "tool_calls"("tenant_id", "tool_call_id");

-- AddForeignKey
ALTER TABLE "agent_grants" ADD CONSTRAINT "agent_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

