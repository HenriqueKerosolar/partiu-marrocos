-- RLS fail-closed para o domínio de veículo do KeroCar — mesmo padrão já
-- aplicado ao domínio de CRM (ver prisma/rls.sql e as migrations
-- *_enable_rls* anteriores). current_tenant_id()/rls_bypass() já existem
-- (criadas na primeira migration de RLS do projeto).

ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "devices"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "vehicles"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "telemetry_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "telemetry_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "telemetry_events"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "dtc_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dtc_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "dtc_events"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "security_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "security_events"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "maintenance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "maintenance_records"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
