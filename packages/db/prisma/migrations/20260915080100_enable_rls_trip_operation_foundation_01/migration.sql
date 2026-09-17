-- Trip Operation Foundation 01 — passo 2/2: RLS, mesmo padrão
-- tenant_isolation de toda outra tabela tenant-scoped deste projeto.

ALTER TABLE "trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trips" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trips"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_itinerary_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_itinerary_days" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_itinerary_days"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_activities" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_activities"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_checklist_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_checklist_items"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
