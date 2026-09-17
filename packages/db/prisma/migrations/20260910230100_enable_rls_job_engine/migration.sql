-- T5 (Job/Execution Engine) — passo 2/2: RLS + imutabilidade condicional de
-- Execution. Mesmo padrão de T1/PM-BLOQ-001/T2/T3 (ver prisma/rls.sql).

ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "jobs"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "executions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "executions"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Execution é imutável só DEPOIS de terminal (SUCCEEDED/FAILED/TIMEOUT) —
-- diferente do append-only puro de audit_logs/cost_events (que bloqueiam
-- UPDATE desde a criação): aqui, heartbeat/lease PRECISAM atualizar a linha
-- enquanto RUNNING (T5 §11). Uma vez terminal, nunca mais muda — cada retry
-- é uma linha NOVA (T5 §33), nunca reescreve a tentativa anterior. Mesma
-- exceção rls_bypass()/withSystem de sempre, pro cascade delete de Tenant
-- não quebrar.
CREATE OR REPLACE FUNCTION executions_imutavel_apos_terminal() RETURNS trigger AS $$
BEGIN
  IF rls_bypass() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'executions não pode ser apagado diretamente (tentativa em id=%)', OLD.id;
  END IF;
  IF OLD.status IN ('SUCCEEDED', 'FAILED', 'TIMEOUT') THEN
    RAISE EXCEPTION 'executions é imutável depois de terminal (status=%, tentativa em id=%)', OLD.status, OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_executions_no_update_terminal
  BEFORE UPDATE ON "executions"
  FOR EACH ROW EXECUTE FUNCTION executions_imutavel_apos_terminal();

CREATE TRIGGER trg_executions_no_delete
  BEFORE DELETE ON "executions"
  FOR EACH ROW EXECUTE FUNCTION executions_imutavel_apos_terminal();
