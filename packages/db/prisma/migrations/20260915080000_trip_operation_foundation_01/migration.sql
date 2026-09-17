-- Trip Operation Foundation 01 (PM-NIGHT-RUN-02, Etapa 5) — 4 tabelas
-- novas + 1 coluna nova nulável em "bookings" (trip_id). Puramente
-- aditivo: nenhuma linha existente é reescrita, nenhum Booking perde seu
-- vínculo comercial. Relação Booking↔Trip é 1:N deliberada (nunca 1:1).

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANEJAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TripChecklistCategoria" AS ENUM ('DOCUMENTOS', 'PAGAMENTO', 'FORNECEDORES', 'TRANSPORTE', 'HOSPEDAGEM', 'ATIVIDADES', 'TRANSFER', 'OUTRO');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "trip_id" TEXT;

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "roteiro" TEXT,
    "mercado" TEXT,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'PLANEJAMENTO',
    "responsavel_operacional_id" TEXT,
    "observacoes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_itinerary_days" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "numero_dia" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "titulo" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_itinerary_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_activities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "itinerary_day_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "local" TEXT,
    "hora_inicio" TEXT,
    "hora_fim" TEXT,
    "instrucoes" TEXT,
    "visivel_para_viajante" BOOLEAN NOT NULL DEFAULT true,
    "fornecedor_referencia" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_checklist_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "categoria" "TripChecklistCategoria" NOT NULL,
    "titulo" TEXT NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trips_tenant_id_idx" ON "trips"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "trips_tenant_id_id_key" ON "trips"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "trip_itinerary_days_tenant_id_idx" ON "trip_itinerary_days"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_itinerary_days_tenant_id_trip_id_idx" ON "trip_itinerary_days"("tenant_id", "trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_itinerary_days_tenant_id_id_key" ON "trip_itinerary_days"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_itinerary_days_tenant_id_trip_id_numero_dia_key" ON "trip_itinerary_days"("tenant_id", "trip_id", "numero_dia");

-- CreateIndex
CREATE INDEX "trip_activities_tenant_id_idx" ON "trip_activities"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_activities_tenant_id_itinerary_day_id_idx" ON "trip_activities"("tenant_id", "itinerary_day_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_activities_tenant_id_id_key" ON "trip_activities"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "trip_checklist_items_tenant_id_idx" ON "trip_checklist_items"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_checklist_items_tenant_id_trip_id_idx" ON "trip_checklist_items"("tenant_id", "trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_checklist_items_tenant_id_id_key" ON "trip_checklist_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_trip_id_idx" ON "bookings"("tenant_id", "trip_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_trip_id_fkey" FOREIGN KEY ("tenant_id", "trip_id") REFERENCES "trips"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_responsavel_operacional_id_fkey" FOREIGN KEY ("responsavel_operacional_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_itinerary_days" ADD CONSTRAINT "trip_itinerary_days_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_itinerary_days" ADD CONSTRAINT "trip_itinerary_days_tenant_id_trip_id_fkey" FOREIGN KEY ("tenant_id", "trip_id") REFERENCES "trips"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_activities" ADD CONSTRAINT "trip_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_activities" ADD CONSTRAINT "trip_activities_tenant_id_itinerary_day_id_fkey" FOREIGN KEY ("tenant_id", "itinerary_day_id") REFERENCES "trip_itinerary_days"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_checklist_items" ADD CONSTRAINT "trip_checklist_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_checklist_items" ADD CONSTRAINT "trip_checklist_items_tenant_id_trip_id_fkey" FOREIGN KEY ("tenant_id", "trip_id") REFERENCES "trips"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
