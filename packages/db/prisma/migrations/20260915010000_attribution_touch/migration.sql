-- T6 (Attribution) — passo 1/2: schema aditivo (tabela nova, nenhuma
-- coluna existente tocada). RLS vem na migration seguinte, mesmo padrão de
-- T1/PM-BLOQ-001/T2/T3/T5.

-- CreateEnum
CREATE TYPE "AttributionTouchType" AS ENUM ('FIRST', 'LAST', 'CONVERSION');

-- CreateTable
CREATE TABLE "attribution_touches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "tipo" "AttributionTouchType" NOT NULL DEFAULT 'CONVERSION',
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "utm_term" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "landing_page" TEXT,
    "referrer" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_touches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attribution_touches_tenant_id_idx" ON "attribution_touches"("tenant_id");

-- CreateIndex
CREATE INDEX "attribution_touches_tenant_id_utm_source_idx" ON "attribution_touches"("tenant_id", "utm_source");

-- CreateIndex
CREATE INDEX "attribution_touches_tenant_id_utm_campaign_idx" ON "attribution_touches"("tenant_id", "utm_campaign");

-- CreateIndex
CREATE INDEX "attribution_touches_tenant_id_contact_id_idx" ON "attribution_touches"("tenant_id", "contact_id");

-- CreateIndex
CREATE INDEX "attribution_touches_tenant_id_lead_id_idx" ON "attribution_touches"("tenant_id", "lead_id");

-- AddForeignKey
ALTER TABLE "attribution_touches" ADD CONSTRAINT "attribution_touches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_touches" ADD CONSTRAINT "attribution_touches_tenant_id_contact_id_fkey" FOREIGN KEY ("tenant_id", "contact_id") REFERENCES "contacts"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_touches" ADD CONSTRAINT "attribution_touches_tenant_id_lead_id_fkey" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "leads"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

