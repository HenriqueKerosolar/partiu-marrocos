-- PM-CONV-03 — passo 2/2: RLS, mesmo padrão tenant_isolation de toda outra
-- tabela tenant-scoped deste projeto (fail-closed: sem contexto de tenant
-- setado, zero linha é visível).

ALTER TABLE "traveler_cares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "traveler_cares" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "traveler_cares"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "professionals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "professionals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "professionals"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "suppliers"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "tour_vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tour_vehicles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tour_vehicles"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_groups" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_groups"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_group_professionals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_group_professionals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_group_professionals"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_activity_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_activity_progress" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_activity_progress"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
