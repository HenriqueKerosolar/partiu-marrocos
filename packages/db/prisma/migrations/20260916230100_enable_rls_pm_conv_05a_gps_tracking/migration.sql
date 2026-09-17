-- PM-CONV-05, Track A — passo 2/2: RLS, mesmo padrão tenant_isolation de
-- toda outra tabela tenant-scoped deste projeto (fail-closed).

ALTER TABLE "tracking_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tracking_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tracking_sessions"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "geolocation_pings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "geolocation_pings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "geolocation_pings"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
