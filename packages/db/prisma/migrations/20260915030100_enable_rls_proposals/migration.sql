-- Proposal Foundation 01 — passo 2/2: RLS, mesmo padrão tenant_isolation de
-- toda outra tabela tenant-scoped deste projeto.

ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proposals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "proposals"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
