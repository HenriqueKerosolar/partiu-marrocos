-- PM-CONV-03 (Core Turístico Canônico) — puramente aditivo: novas colunas
-- nuláveis em "bookings"/"travelers"/"trip_activities" + 6 tabelas novas
-- (professionals, suppliers, tour_vehicles, trip_groups,
-- trip_group_professionals, trip_activity_progress, traveler_cares).
-- Nenhuma tabela existente é reescrita, nenhuma coluna removida.

-- CreateEnum
CREATE TYPE "ProfessionalPapel" AS ENUM ('GUIA', 'MOTORISTA');

-- CreateEnum
CREATE TYPE "TripActivityProgressStatus" AS ENUM ('PLANEJADA', 'ATUAL', 'CONCLUIDA', 'PULADA');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "trip_group_id" TEXT;

-- AlterTable
ALTER TABLE "travelers" ADD COLUMN     "contato_emergencia_nome" TEXT,
ADD COLUMN     "contato_emergencia_telefone" TEXT,
ADD COLUMN     "guardiao_email" TEXT,
ADD COLUMN     "guardiao_nome" TEXT,
ADD COLUMN     "guardiao_relacao" TEXT,
ADD COLUMN     "passaporte_emitido_em" TIMESTAMP(3),
ADD COLUMN     "passaporte_numero" TEXT,
ADD COLUMN     "passaporte_pais_emissor" TEXT,
ADD COLUMN     "passaporte_tipo" TEXT,
ADD COLUMN     "passaporte_valido_ate" TIMESTAMP(3),
ADD COLUMN     "voo_chegada_aeroporto" TEXT,
ADD COLUMN     "voo_chegada_companhia" TEXT,
ADD COLUMN     "voo_chegada_em" TIMESTAMP(3),
ADD COLUMN     "voo_chegada_numero" TEXT,
ADD COLUMN     "voo_partida_aeroporto" TEXT,
ADD COLUMN     "voo_partida_companhia" TEXT,
ADD COLUMN     "voo_partida_em" TIMESTAMP(3),
ADD COLUMN     "voo_partida_numero" TEXT;

-- AlterTable
ALTER TABLE "trip_activities" ADD COLUMN     "fornecedor_id" TEXT;

-- CreateTable
CREATE TABLE "traveler_cares" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "traveler_id" TEXT NOT NULL,
    "dieta" TEXT,
    "condicoes" TEXT,
    "medicamentos" TEXT,
    "frequencia" TEXT,
    "consentimento" BOOLEAN NOT NULL DEFAULT false,
    "registrado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traveler_cares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "idiomas" TEXT,
    "documento" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "cidade" TEXT,
    "contato" TEXT,
    "email" TEXT,
    "servicos" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_vehicles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "placa" TEXT,
    "categoria" TEXT,
    "capacidade" INTEGER NOT NULL,
    "fornecedor_id" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "veiculo_id" TEXT NOT NULL,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_group_professionals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "trip_group_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "papel" "ProfessionalPapel" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_group_professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_activity_progress" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "trip_group_id" TEXT NOT NULL,
    "trip_activity_id" TEXT NOT NULL,
    "status" "TripActivityProgressStatus" NOT NULL DEFAULT 'PLANEJADA',
    "atualizado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_activity_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "traveler_cares_tenant_id_idx" ON "traveler_cares"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "traveler_cares_tenant_id_id_key" ON "traveler_cares"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "traveler_cares_tenant_id_traveler_id_key" ON "traveler_cares"("tenant_id", "traveler_id");

-- CreateIndex
CREATE INDEX "professionals_tenant_id_idx" ON "professionals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_tenant_id_id_key" ON "professionals"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_id_key" ON "suppliers"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "tour_vehicles_tenant_id_idx" ON "tour_vehicles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tour_vehicles_tenant_id_id_key" ON "tour_vehicles"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "trip_groups_tenant_id_idx" ON "trip_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_groups_tenant_id_trip_id_idx" ON "trip_groups"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "trip_groups_tenant_id_veiculo_id_idx" ON "trip_groups"("tenant_id", "veiculo_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_groups_tenant_id_id_key" ON "trip_groups"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "trip_group_professionals_tenant_id_idx" ON "trip_group_professionals"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_group_professionals_tenant_id_trip_group_id_idx" ON "trip_group_professionals"("tenant_id", "trip_group_id");

-- CreateIndex
CREATE INDEX "trip_group_professionals_tenant_id_professional_id_idx" ON "trip_group_professionals"("tenant_id", "professional_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_group_professionals_tenant_id_id_key" ON "trip_group_professionals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_group_professionals_tenant_id_trip_group_id_profession_key" ON "trip_group_professionals"("tenant_id", "trip_group_id", "professional_id", "papel");

-- CreateIndex
CREATE INDEX "trip_activity_progress_tenant_id_idx" ON "trip_activity_progress"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_activity_progress_tenant_id_trip_group_id_idx" ON "trip_activity_progress"("tenant_id", "trip_group_id");

-- CreateIndex
CREATE INDEX "trip_activity_progress_tenant_id_trip_activity_id_idx" ON "trip_activity_progress"("tenant_id", "trip_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_activity_progress_tenant_id_id_key" ON "trip_activity_progress"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_activity_progress_tenant_id_trip_group_id_trip_activit_key" ON "trip_activity_progress"("tenant_id", "trip_group_id", "trip_activity_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_trip_group_id_idx" ON "bookings"("tenant_id", "trip_group_id");

-- CreateIndex
CREATE INDEX "trip_activities_tenant_id_fornecedor_id_idx" ON "trip_activities"("tenant_id", "fornecedor_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_trip_group_id_fkey" FOREIGN KEY ("tenant_id", "trip_group_id") REFERENCES "trip_groups"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_cares" ADD CONSTRAINT "traveler_cares_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_cares" ADD CONSTRAINT "traveler_cares_tenant_id_traveler_id_fkey" FOREIGN KEY ("tenant_id", "traveler_id") REFERENCES "travelers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_cares" ADD CONSTRAINT "traveler_cares_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_activities" ADD CONSTRAINT "trip_activities_tenant_id_fornecedor_id_fkey" FOREIGN KEY ("tenant_id", "fornecedor_id") REFERENCES "suppliers"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_vehicles" ADD CONSTRAINT "tour_vehicles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_groups" ADD CONSTRAINT "trip_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_groups" ADD CONSTRAINT "trip_groups_tenant_id_trip_id_fkey" FOREIGN KEY ("tenant_id", "trip_id") REFERENCES "trips"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_groups" ADD CONSTRAINT "trip_groups_tenant_id_veiculo_id_fkey" FOREIGN KEY ("tenant_id", "veiculo_id") REFERENCES "tour_vehicles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_group_professionals" ADD CONSTRAINT "trip_group_professionals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_group_professionals" ADD CONSTRAINT "trip_group_professionals_tenant_id_trip_group_id_fkey" FOREIGN KEY ("tenant_id", "trip_group_id") REFERENCES "trip_groups"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_group_professionals" ADD CONSTRAINT "trip_group_professionals_tenant_id_professional_id_fkey" FOREIGN KEY ("tenant_id", "professional_id") REFERENCES "professionals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_activity_progress" ADD CONSTRAINT "trip_activity_progress_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_activity_progress" ADD CONSTRAINT "trip_activity_progress_tenant_id_trip_group_id_fkey" FOREIGN KEY ("tenant_id", "trip_group_id") REFERENCES "trip_groups"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_activity_progress" ADD CONSTRAINT "trip_activity_progress_tenant_id_trip_activity_id_fkey" FOREIGN KEY ("tenant_id", "trip_activity_id") REFERENCES "trip_activities"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_activity_progress" ADD CONSTRAINT "trip_activity_progress_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

