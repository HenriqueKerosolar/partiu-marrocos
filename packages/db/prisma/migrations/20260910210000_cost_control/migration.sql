-- T2 (Cost Control) — passo 1/2: schema aditivo (tabelas/enums novos, nenhuma
-- coluna existente tocada). RLS (passo 2) vem na migration seguinte, mesmo
-- padrão de T1/PM-BLOQ-001.

-- CreateEnum
CREATE TYPE "CostKind" AS ENUM ('ACTUAL', 'ESTIMATED', 'UNKNOWN', 'SUBSCRIPTION_USAGE', 'FREE_TIER_USAGE', 'ZERO_MARGINAL_COST');

-- CreateEnum
CREATE TYPE "CostPolicyEscopo" AS ENUM ('TENANT', 'PROVIDER', 'MODEL', 'CAPABILITY', 'AGENT');

-- CreateEnum
CREATE TYPE "CostPolicyPeriodo" AS ENUM ('POR_CHAMADA', 'DIARIO', 'MENSAL');

-- CreateTable
CREATE TABLE "cost_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "capability" TEXT,
    "agent" TEXT,
    "operation" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cached_tokens" INTEGER,
    "unidade" TEXT,
    "quantidade" DECIMAL(20,6),
    "moeda" TEXT NOT NULL DEFAULT 'USD',
    "custo_unitario" DECIMAL(20,10),
    "custo_total" DECIMAL(20,10),
    "cost_kind" "CostKind" NOT NULL,
    "source" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "escopo" "CostPolicyEscopo" NOT NULL,
    "escopo_valor" TEXT NOT NULL DEFAULT '',
    "periodo" "CostPolicyPeriodo" NOT NULL,
    "limite" DECIMAL(20,10) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'USD',
    "alerta_percentual" DECIMAL(5,2) NOT NULL DEFAULT 80,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_usages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "escopo" "CostPolicyEscopo" NOT NULL,
    "escopo_valor" TEXT NOT NULL DEFAULT '',
    "periodo" "CostPolicyPeriodo" NOT NULL,
    "periodo_chave" TEXT NOT NULL,
    "moeda" TEXT NOT NULL,
    "acumulado" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_prices" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "capability" TEXT,
    "moeda" TEXT NOT NULL DEFAULT 'USD',
    "unidade" TEXT NOT NULL DEFAULT 'token',
    "preco_entrada" DECIMAL(20,10),
    "preco_saida" DECIMAL(20,10),
    "preco_unico" DECIMAL(20,10),
    "versao" TEXT NOT NULL,
    "vigente_desde" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_gate_consumos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "gate_id" TEXT NOT NULL,
    "consumido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_gate_consumos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_events_tenant_id_idx" ON "cost_events"("tenant_id");

-- CreateIndex
CREATE INDEX "cost_events_tenant_id_created_at_idx" ON "cost_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "cost_events_tenant_id_provider_idx" ON "cost_events"("tenant_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "cost_events_tenant_id_idempotency_key_key" ON "cost_events"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "cost_policies_tenant_id_idx" ON "cost_policies"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_policies_tenant_id_escopo_escopo_valor_periodo_key" ON "cost_policies"("tenant_id", "escopo", "escopo_valor", "periodo");

-- CreateIndex
CREATE INDEX "cost_usages_tenant_id_idx" ON "cost_usages"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_usages_tenant_id_escopo_escopo_valor_periodo_periodo_c_key" ON "cost_usages"("tenant_id", "escopo", "escopo_valor", "periodo", "periodo_chave", "moeda");

-- CreateIndex
CREATE INDEX "model_prices_provider_model_capability_idx" ON "model_prices"("provider", "model", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "cost_gate_consumos_tenant_id_gate_id_key" ON "cost_gate_consumos"("tenant_id", "gate_id");

-- AddForeignKey
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_policies" ADD CONSTRAINT "cost_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_usages" ADD CONSTRAINT "cost_usages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_gate_consumos" ADD CONSTRAINT "cost_gate_consumos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_gate_consumos" ADD CONSTRAINT "cost_gate_consumos_tenant_id_gate_id_fkey" FOREIGN KEY ("tenant_id", "gate_id") REFERENCES "gates"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

