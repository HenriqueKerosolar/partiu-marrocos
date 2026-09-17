-- Booking Foundation 01 — passo 2/2: RLS, mesmo padrão tenant_isolation de
-- toda outra tabela tenant-scoped deste projeto.

ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bookings"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "travelers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "travelers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "travelers"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
