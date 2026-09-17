-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ATIVO', 'INATIVO', 'MANUTENCAO');

-- CreateEnum
CREATE TYPE "TelemetryQuality" AS ENUM ('BOA', 'DEGRADADA', 'RUIM');

-- CreateEnum
CREATE TYPE "DtcStatus" AS ENUM ('ATIVO', 'PENDENTE', 'PERMANENTE');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('IMPACTO', 'TAMPER', 'GEOFENCE', 'MOTORISTA_DESCONHECIDO');

-- CreateEnum
CREATE TYPE "SecurityEventSeverity" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "fabricante" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "imei" TEXT,
    "hw_revision" TEXT,
    "fw_revision" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "vin" TEXT,
    "placa" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "ano" INTEGER,
    "motorizacao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "device_timestamp" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quality" "TelemetryQuality" NOT NULL DEFAULT 'BOA',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speed_kmh" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "gnss_accuracy_m" DOUBLE PRECISION,
    "ignition" BOOLEAN,
    "battery_voltage" DOUBLE PRECISION,
    "odometer_km" DOUBLE PRECISION,
    "rpm" INTEGER,
    "engine_temp_c" DOUBLE PRECISION,
    "raw_payload" JSONB,

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dtc_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "codigo" TEXT NOT NULL,
    "ecu" TEXT,
    "status" "DtcStatus" NOT NULL DEFAULT 'ATIVO',
    "mil_on" BOOLEAN NOT NULL DEFAULT false,
    "freeze_frame" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dtc_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "tipo" "SecurityEventType" NOT NULL,
    "severidade" "SecurityEventSeverity" NOT NULL DEFAULT 'MEDIA',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "evidencia" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "odometer_km" DOUBLE PRECISION,
    "tipo_servico" TEXT NOT NULL,
    "custo" DOUBLE PRECISION,
    "moeda" TEXT DEFAULT 'BRL',
    "performed_at" TIMESTAMP(3) NOT NULL,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "devices_tenant_id_idx" ON "devices"("tenant_id");

-- CreateIndex
CREATE INDEX "devices_tenant_id_vehicle_id_idx" ON "devices"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_tenant_id_id_key" ON "devices"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_tenant_id_serial_key" ON "devices"("tenant_id", "serial");

-- CreateIndex
CREATE INDEX "vehicles_tenant_id_idx" ON "vehicles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_tenant_id_id_key" ON "vehicles"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "telemetry_events_tenant_id_idx" ON "telemetry_events"("tenant_id");

-- CreateIndex
CREATE INDEX "telemetry_events_tenant_id_vehicle_id_device_timestamp_idx" ON "telemetry_events"("tenant_id", "vehicle_id", "device_timestamp");

-- CreateIndex
CREATE INDEX "telemetry_events_tenant_id_device_id_device_timestamp_idx" ON "telemetry_events"("tenant_id", "device_id", "device_timestamp");

-- CreateIndex
CREATE INDEX "dtc_events_tenant_id_idx" ON "dtc_events"("tenant_id");

-- CreateIndex
CREATE INDEX "dtc_events_tenant_id_vehicle_id_idx" ON "dtc_events"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "security_events_tenant_id_idx" ON "security_events"("tenant_id");

-- CreateIndex
CREATE INDEX "security_events_tenant_id_vehicle_id_idx" ON "security_events"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "maintenance_records_tenant_id_idx" ON "maintenance_records"("tenant_id");

-- CreateIndex
CREATE INDEX "maintenance_records_tenant_id_vehicle_id_idx" ON "maintenance_records"("tenant_id", "vehicle_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_vehicle_id_fkey" FOREIGN KEY ("tenant_id", "vehicle_id") REFERENCES "vehicles"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "devices"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_tenant_id_vehicle_id_fkey" FOREIGN KEY ("tenant_id", "vehicle_id") REFERENCES "vehicles"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtc_events" ADD CONSTRAINT "dtc_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtc_events" ADD CONSTRAINT "dtc_events_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "devices"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtc_events" ADD CONSTRAINT "dtc_events_tenant_id_vehicle_id_fkey" FOREIGN KEY ("tenant_id", "vehicle_id") REFERENCES "vehicles"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "devices"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_tenant_id_vehicle_id_fkey" FOREIGN KEY ("tenant_id", "vehicle_id") REFERENCES "vehicles"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_tenant_id_vehicle_id_fkey" FOREIGN KEY ("tenant_id", "vehicle_id") REFERENCES "vehicles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
