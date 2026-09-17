-- PM-CONV-05, Track B — ocorrência operacional (guia/motorista em campo).
-- Puramente aditivo: uma tabela nova, nenhuma alteração em tabela
-- existente.

-- CreateEnum
CREATE TYPE "TripIncidentSeveridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateTable
CREATE TABLE "trip_incidents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "trip_group_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "severidade" "TripIncidentSeveridade" NOT NULL DEFAULT 'MEDIA',
    "descricao" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_incidents_tenant_id_idx" ON "trip_incidents"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_incidents_tenant_id_trip_group_id_idx" ON "trip_incidents"("tenant_id", "trip_group_id");

-- AddForeignKey
ALTER TABLE "trip_incidents" ADD CONSTRAINT "trip_incidents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_incidents" ADD CONSTRAINT "trip_incidents_tenant_id_trip_group_id_fkey" FOREIGN KEY ("tenant_id", "trip_group_id") REFERENCES "trip_groups"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_incidents" ADD CONSTRAINT "trip_incidents_tenant_id_professional_id_fkey" FOREIGN KEY ("tenant_id", "professional_id") REFERENCES "professionals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
