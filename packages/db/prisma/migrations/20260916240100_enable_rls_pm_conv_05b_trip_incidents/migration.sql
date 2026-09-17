-- PM-CONV-05, Track B — passo 2/2: RLS, mesmo padrão tenant_isolation de
-- toda outra tabela tenant-scoped deste projeto (fail-closed).

ALTER TABLE "trip_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_incidents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_incidents"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
