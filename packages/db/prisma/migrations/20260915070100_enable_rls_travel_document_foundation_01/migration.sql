-- Travel Document Foundation 01 — passo 2/2: RLS, mesmo padrão
-- tenant_isolation de toda outra tabela tenant-scoped deste projeto.

ALTER TABLE "document_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_requirements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "document_requirements"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "traveler_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "traveler_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "traveler_documents"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
