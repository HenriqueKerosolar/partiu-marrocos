-- Finance Core Real 01 (PM-NIGHT-RUN-02, Etapa 3) — 2 tabelas novas,
-- nenhuma alteração em tabela existente. `commercial_policies` tem
-- defaults iguais aos limiares fixos já usados antes desta etapa (nenhuma
-- mudança de comportamento pra tenant sem linha própria).

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PREVISTA', 'CONFIRMADA', 'PAGA', 'CANCELADA');

-- CreateTable
CREATE TABLE "commercial_policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "limite_desconto_relevante" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "limite_mudanca_preco_excepcional" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "limite_margem_minima" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "atualizado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "beneficiario_id" TEXT NOT NULL,
    "base_calculo" DOUBLE PRECISION,
    "percentual" DOUBLE PRECISION,
    "valor" DOUBLE PRECISION NOT NULL,
    "moeda" TEXT NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PREVISTA',
    "gate_id" TEXT,
    "paga_em" TIMESTAMP(3),
    "criado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_policies_tenant_id_key" ON "commercial_policies"("tenant_id");

-- CreateIndex
CREATE INDEX "commissions_tenant_id_idx" ON "commissions"("tenant_id");

-- CreateIndex
CREATE INDEX "commissions_tenant_id_booking_id_idx" ON "commissions"("tenant_id", "booking_id");

-- CreateIndex
CREATE INDEX "commissions_tenant_id_beneficiario_id_idx" ON "commissions"("tenant_id", "beneficiario_id");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_tenant_id_id_key" ON "commissions"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "commercial_policies" ADD CONSTRAINT "commercial_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_policies" ADD CONSTRAINT "commercial_policies_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_tenant_id_booking_id_fkey" FOREIGN KEY ("tenant_id", "booking_id") REFERENCES "bookings"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_beneficiario_id_fkey" FOREIGN KEY ("beneficiario_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
