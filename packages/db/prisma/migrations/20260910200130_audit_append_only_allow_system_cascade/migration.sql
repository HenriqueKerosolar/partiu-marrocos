-- Achado real durante a implementação de T1: o trigger append-only original
-- bloqueava até um DELETE em cascata legítimo (ex.: apagar um Tenant inteiro
-- apaga seus audit_logs via ON DELETE CASCADE — o trigger disparava mesmo
-- assim, e não distingue "app tentando adulterar histórico" de "operação
-- administrativa real removendo o tenant inteiro").
--
-- Correção: reaproveita o MESMO escape hatch que já existe pra RLS
-- (rls_bypass(), setado só dentro de withSystem() — nunca por padrão numa
-- conexão comum). Fora de withSystem (ou seja, em qualquer código de
-- aplicação normal via withTenant), o append-only continua absoluto —
-- nenhuma linha de audit pode ser alterada/apagada. Só a mesma via já
-- reservada pra operação administrativa cross-tenant pode.
CREATE OR REPLACE FUNCTION audit_logs_no_update_delete() RETURNS trigger AS $$
BEGIN
  IF rls_bypass() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_logs é append-only — UPDATE/DELETE não são permitidos (tentativa em id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;
