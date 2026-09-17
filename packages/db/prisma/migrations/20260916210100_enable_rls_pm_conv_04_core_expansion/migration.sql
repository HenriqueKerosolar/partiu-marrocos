-- PM-CONV-04 — passo 2/2: RLS, mesmo padrão tenant_isolation de toda outra
-- tabela tenant-scoped deste projeto (fail-closed).

ALTER TABLE "traveler_checkins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "traveler_checkins" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "traveler_checkins"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partners" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "partners"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "partner_referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_referrals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "partner_referrals"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "reward_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reward_campaigns" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "reward_campaigns"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "reward_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reward_claims" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "reward_claims"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_tickets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_tickets"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "support_ticket_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_ticket_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_ticket_messages"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
