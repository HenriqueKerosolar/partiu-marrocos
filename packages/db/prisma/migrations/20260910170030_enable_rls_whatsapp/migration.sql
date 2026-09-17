ALTER TABLE "whatsapp_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "whatsapp_accounts"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
