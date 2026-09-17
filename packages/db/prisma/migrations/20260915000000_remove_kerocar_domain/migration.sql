-- Remove o domínio KeroCar Vehicle deste repositório — autorizado
-- explicitamente pelo fundador em 15/09/2026 ("kerocar saiu daqui dessa
-- pasta, nada a ver com o projeto, pode limpar qualquer referência").
-- KeroCar já vive como projeto próprio em D:\Projetos\OBD2; esta cópia era
-- resíduo compartilhado da fundação original (ver PLANO-MESTRE-EXECUCAO.md
-- seção M). Confirmado antes de rodar: as 6 tabelas abaixo estavam vazias
-- (0 linhas cada) no banco local — nenhum dado real foi perdido.
-- DropForeignKey
ALTER TABLE "devices" DROP CONSTRAINT "devices_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "devices" DROP CONSTRAINT "devices_tenant_id_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "dtc_events" DROP CONSTRAINT "dtc_events_tenant_id_device_id_fkey";

-- DropForeignKey
ALTER TABLE "dtc_events" DROP CONSTRAINT "dtc_events_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "dtc_events" DROP CONSTRAINT "dtc_events_tenant_id_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_records" DROP CONSTRAINT "maintenance_records_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_records" DROP CONSTRAINT "maintenance_records_tenant_id_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "security_events" DROP CONSTRAINT "security_events_tenant_id_device_id_fkey";

-- DropForeignKey
ALTER TABLE "security_events" DROP CONSTRAINT "security_events_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "security_events" DROP CONSTRAINT "security_events_tenant_id_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "telemetry_events" DROP CONSTRAINT "telemetry_events_tenant_id_device_id_fkey";

-- DropForeignKey
ALTER TABLE "telemetry_events" DROP CONSTRAINT "telemetry_events_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "telemetry_events" DROP CONSTRAINT "telemetry_events_tenant_id_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_tenant_id_fkey";

-- DropTable
DROP TABLE "devices";

-- DropTable
DROP TABLE "dtc_events";

-- DropTable
DROP TABLE "maintenance_records";

-- DropTable
DROP TABLE "security_events";

-- DropTable
DROP TABLE "telemetry_events";

-- DropTable
DROP TABLE "vehicles";

-- DropEnum
DROP TYPE "DeviceStatus";

-- DropEnum
DROP TYPE "DtcStatus";

-- DropEnum
DROP TYPE "SecurityEventSeverity";

-- DropEnum
DROP TYPE "SecurityEventType";

-- DropEnum
DROP TYPE "TelemetryQuality";

