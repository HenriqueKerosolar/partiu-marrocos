-- T2 (Cost Control) — passo 2/2: RLS + append-only. Mesmo padrão de
-- T1/PM-BLOQ-001 (ver prisma/rls.sql). `model_prices` fica DE FORA de
-- propósito — é catálogo global (preço de mercado do provider, não
-- configuração de tenant), mesmo tratamento de `permissions`.

ALTER TABLE "cost_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cost_events"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "cost_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cost_policies"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "cost_usages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_usages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cost_usages"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "cost_gate_consumos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_gate_consumos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cost_gate_consumos"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Append-only real em banco para cost_events (ledger de custo — T2 §3/§23
-- da autorização: "se CostEvent for adotado como ledger, garantir
-- imutabilidade também em banco, preferencialmente seguindo o padrão
-- append-only do Audit Log"). Correção prevista, com a MESMA exceção via
-- rls_bypass() que T1 precisou (não descoberta de novo aqui — aplicada já
-- corrigida desde o início, para não repetir o achado de T1): sem isso,
-- apagar um Tenant inteiro (ON DELETE CASCADE) falharia ao tentar apagar
-- seus cost_events. Fora de withSystem, o append-only é absoluto — nenhuma
-- correção de custo é feita editando o histórico, só por evento
-- compensatório/ajuste novo (ver cost-control.ts).
CREATE OR REPLACE FUNCTION cost_events_no_update_delete() RETURNS trigger AS $$
BEGIN
  IF rls_bypass() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'cost_events é append-only — UPDATE/DELETE não são permitidos (tentativa em id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cost_events_no_update
  BEFORE UPDATE ON "cost_events"
  FOR EACH ROW EXECUTE FUNCTION cost_events_no_update_delete();

CREATE TRIGGER trg_cost_events_no_delete
  BEFORE DELETE ON "cost_events"
  FOR EACH ROW EXECUTE FUNCTION cost_events_no_update_delete();
