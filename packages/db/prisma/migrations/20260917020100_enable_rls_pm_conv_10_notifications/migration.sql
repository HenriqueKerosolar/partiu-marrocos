ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
