-- Booking Foundation 01 (PM-NIGHT-RUN-02, Etapa 1) — 2 tabelas novas,
-- nenhuma alteração em tabela existente. Booking não duplica roteiro/
-- preço/moeda/datas/passageiros da Proposal (a Proposal ACEITA já é o
-- snapshot imutável) — só a FK. `bookings_tenant_id_proposal_id_key` é a
-- idempotência estrutural: uma Proposal só pode originar UM Booking.

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('AGUARDANDO_PAGAMENTO', 'PAGAMENTO_PARCIAL', 'PAGO', 'AGUARDANDO_DOCUMENTOS', 'CONFIRMADA', 'EM_OPERACAO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TravelerTipo" AS ENUM ('ADULTO', 'CRIANCA', 'BEBE');

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "responsavel_id" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travelers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TravelerTipo" NOT NULL DEFAULT 'ADULTO',
    "data_nascimento" TIMESTAMP(3),
    "nacionalidade" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travelers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bookings_tenant_id_idx" ON "bookings"("tenant_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_lead_id_idx" ON "bookings"("tenant_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_tenant_id_id_key" ON "bookings"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_tenant_id_proposal_id_key" ON "bookings"("tenant_id", "proposal_id");

-- CreateIndex
CREATE INDEX "travelers_tenant_id_idx" ON "travelers"("tenant_id");

-- CreateIndex
CREATE INDEX "travelers_tenant_id_booking_id_idx" ON "travelers"("tenant_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "travelers_tenant_id_id_key" ON "travelers"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_proposal_id_fkey" FOREIGN KEY ("tenant_id", "proposal_id") REFERENCES "proposals"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_lead_id_fkey" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "leads"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_tenant_id_booking_id_fkey" FOREIGN KEY ("tenant_id", "booking_id") REFERENCES "bookings"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
