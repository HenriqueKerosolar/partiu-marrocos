-- Finance Core Real 01 — passo 2/2: RLS, mesmo padrão tenant_isolation de
-- toda outra tabela tenant-scoped deste projeto.

ALTER TABLE "commercial_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_policies"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "commissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commissions"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
