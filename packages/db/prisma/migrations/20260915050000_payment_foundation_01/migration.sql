-- Payment Foundation 01 (PM-NIGHT-RUN-02, Etapa 2) — 1 tabela nova, nenhuma
-- alteração em tabela existente. Domínio PROVIDER-NEUTRAL: "provider"/
-- "provider_reference" ficam nulos em modo MANUAL/OFFLINE (nenhum gateway
-- real integrado nesta rodada).

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDENTE', 'PROCESSANDO', 'PAGO', 'PARCIALMENTE_PAGO', 'FALHOU', 'CANCELADO', 'REEMBOLSADO', 'PARCIALMENTE_REEMBOLSADO');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "moeda" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDENTE',
    "method" TEXT,
    "provider" TEXT,
    "provider_reference" TEXT,
    "idempotency_key" TEXT,
    "vencimento" TIMESTAMP(3),
    "pago_em" TIMESTAMP(3),
    "cancelado_em" TIMESTAMP(3),
    "estornado_em" TIMESTAMP(3),
    "valor_estornado" DOUBLE PRECISION,
    "gate_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_tenant_id_idx" ON "payments"("tenant_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_booking_id_idx" ON "payments"("tenant_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_id_key" ON "payments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_idempotency_key_key" ON "payments"("tenant_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_booking_id_fkey" FOREIGN KEY ("tenant_id", "booking_id") REFERENCES "bookings"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
