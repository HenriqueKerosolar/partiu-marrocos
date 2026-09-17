-- Append-only real em banco pro audit_logs (T1) — até aqui era só convenção
-- de aplicação (nenhuma função de update/delete no código, mas nada impedia
-- um UPDATE/DELETE manual). Comprovado como padrão real e testado no Ai DEV
-- Orquestrador (auditoria seção 19): "UPDATE audit_events SET actor=... via
-- SQL bruto lança exceção com /append-only/". Mesma garantia aqui, via
-- trigger em vez de confiar só em não escrever a função de update em código.
CREATE OR REPLACE FUNCTION audit_logs_no_update_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs é append-only — UPDATE/DELETE não são permitidos (tentativa em id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_no_update_delete();

CREATE TRIGGER trg_audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_no_update_delete();
