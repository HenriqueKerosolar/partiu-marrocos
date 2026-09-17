-- PM-CONV-05, Track A — GPS/Mapas/Live Location. Puramente aditivo
-- (expand): nova coluna nulável em professionals, novas colunas nulável em
-- trip_activities, duas tabelas novas. Nenhuma coluna/tabela existente é
-- removida ou tem seu tipo alterado.

-- CreateEnum
CREATE TYPE "TrackingSessionStatus" AS ENUM ('ATIVA', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "GeolocationSource" AS ENUM ('GPS', 'NETWORK', 'MANUAL');

-- AlterTable: link opcional Professional -> User (login do guia/motorista)
ALTER TABLE "professionals" ADD COLUMN     "user_id" TEXT;

-- AlterTable: coordenadas reais e opcionais de uma parada do itinerário
ALTER TABLE "trip_activities" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "tracking_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "trip_group_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "status" "TrackingSessionStatus" NOT NULL DEFAULT 'ATIVA',
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciado_por_id" TEXT,
    "finalizado_em" TIMESTAMP(3),
    "finalizado_por_id" TEXT,

    CONSTRAINT "tracking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geolocation_pings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tracking_session_id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "source" "GeolocationSource" NOT NULL DEFAULT 'GPS',
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geolocation_pings_pkey" PRIMARY KEY ("id")
);

-- Integridade de coordenada — nunca confiar só na validação de aplicação
-- para um dado que pode ser escrito por um endpoint de API mobile (§ "GPS
-- animado/falso é proibido" — coordenada fora do intervalo válido nunca
-- deveria existir no banco, ponto).
ALTER TABLE "geolocation_pings" ADD CONSTRAINT "geolocation_pings_latitude_range_check"
  CHECK (latitude >= -90 AND latitude <= 90);
ALTER TABLE "geolocation_pings" ADD CONSTRAINT "geolocation_pings_longitude_range_check"
  CHECK (longitude >= -180 AND longitude <= 180);

-- CreateIndex
CREATE UNIQUE INDEX "professionals_user_id_key" ON "professionals"("user_id");

-- CreateIndex
CREATE INDEX "tracking_sessions_tenant_id_idx" ON "tracking_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "tracking_sessions_tenant_id_trip_group_id_idx" ON "tracking_sessions"("tenant_id", "trip_group_id");

-- CreateIndex
CREATE INDEX "tracking_sessions_tenant_id_professional_id_idx" ON "tracking_sessions"("tenant_id", "professional_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_sessions_tenant_id_id_key" ON "tracking_sessions"("tenant_id", "id");

-- Nunca duas sessões ATIVAS para o mesmo (grupo, profissional) ao mesmo
-- tempo — defesa em profundidade no banco, não só checada em
-- geolocation.ts (mesmo padrão da CHECK constraint XOR de Commission em
-- PM-CONV-04).
CREATE UNIQUE INDEX "tracking_sessions_ativa_unica" ON "tracking_sessions"("tenant_id", "trip_group_id", "professional_id") WHERE "status" = 'ATIVA';

-- CreateIndex
CREATE INDEX "geolocation_pings_tenant_id_idx" ON "geolocation_pings"("tenant_id");

-- CreateIndex
CREATE INDEX "geolocation_pings_tenant_id_tracking_session_id_captured_a_idx" ON "geolocation_pings"("tenant_id", "tracking_session_id", "captured_at");

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_tenant_id_trip_group_id_fkey" FOREIGN KEY ("tenant_id", "trip_group_id") REFERENCES "trip_groups"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_tenant_id_professional_id_fkey" FOREIGN KEY ("tenant_id", "professional_id") REFERENCES "professionals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_iniciado_por_id_fkey" FOREIGN KEY ("iniciado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_finalizado_por_id_fkey" FOREIGN KEY ("finalizado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geolocation_pings" ADD CONSTRAINT "geolocation_pings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geolocation_pings" ADD CONSTRAINT "geolocation_pings_tenant_id_tracking_session_id_fkey" FOREIGN KEY ("tenant_id", "tracking_session_id") REFERENCES "tracking_sessions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
