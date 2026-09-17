-- T3 (Tool Broker) — passo 2/2: RLS. Mesmo padrão de T1/PM-BLOQ-001/T2 (ver
-- prisma/rls.sql). Nem `agent_grants` nem `tool_calls` são append-only —
-- `tool_calls` precisa de UPDATE real (STARTED → COMPLETED/FAILED/TIMEOUT,
-- é o próprio mecanismo de idempotência, não um ledger histórico).

ALTER TABLE "agent_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_grants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_grants"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "tool_calls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tool_calls" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tool_calls"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
