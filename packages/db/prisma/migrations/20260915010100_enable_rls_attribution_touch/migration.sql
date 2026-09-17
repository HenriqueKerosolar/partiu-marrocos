-- T6 (Attribution) — passo 2/2: RLS, mesmo padrão tenant_isolation de toda
-- outra tabela tenant-scoped deste projeto.

ALTER TABLE "attribution_touches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attribution_touches" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attribution_touches"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
