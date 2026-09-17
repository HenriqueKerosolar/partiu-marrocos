-- PM-CONV-10 — Post-Trip Foundation (avaliação/NPS + depoimento com
-- consentimento explícito). Puramente aditiva (1 tabela nova), nenhuma
-- alteração em tabela existente.

-- CreateTable
CREATE TABLE "trip_reviews" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "depoimento_autorizado" BOOLEAN NOT NULL DEFAULT false,
    "depoimento_publicado" BOOLEAN NOT NULL DEFAULT false,
    "publicado_por_id" TEXT,
    "publicado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_reviews_pkey" PRIMARY KEY ("id")
);

-- Integridade de nota — nunca confiar só na validação de aplicação (mesmo
-- padrão de latitude/longitude do GPS, PM-CONV-05a).
ALTER TABLE "trip_reviews" ADD CONSTRAINT "trip_reviews_nota_range_check"
  CHECK (nota >= 1 AND nota <= 5);

-- Um humano da equipe só pode ter publicado o depoimento se o cliente
-- consentiu — invariante estrutural, não só de código (§ "consentir nunca
-- publica sozinho" também vale ao contrário: nunca publicado sem consentimento).
ALTER TABLE "trip_reviews" ADD CONSTRAINT "trip_reviews_publicado_exige_autorizado_check"
  CHECK (NOT depoimento_publicado OR depoimento_autorizado);

-- CreateIndex
CREATE UNIQUE INDEX "trip_reviews_tenant_id_booking_id_key" ON "trip_reviews"("tenant_id", "booking_id");

-- CreateIndex
CREATE INDEX "trip_reviews_tenant_id_idx" ON "trip_reviews"("tenant_id");

-- AddForeignKey
ALTER TABLE "trip_reviews" ADD CONSTRAINT "trip_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_reviews" ADD CONSTRAINT "trip_reviews_tenant_id_booking_id_fkey" FOREIGN KEY ("tenant_id", "booking_id") REFERENCES "bookings"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_reviews" ADD CONSTRAINT "trip_reviews_publicado_por_id_fkey" FOREIGN KEY ("publicado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
