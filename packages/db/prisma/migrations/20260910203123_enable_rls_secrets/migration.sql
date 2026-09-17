-- PM-BLOQ-001 (Secret Provider) — RLS da tabela `secrets`, mesmo padrão
-- fail-closed de toda tabela tenant-scoped desta fundação (ver
-- prisma/rls.sql e a migration 20260910200030_enable_rls_gates de T1).
--
-- Editado à mão: `prisma migrate dev --create-only` tentou incluir aqui o
-- DROP das colunas antigas de texto plano (ai_api_key/access_token/
-- app_secret) — removido deliberadamente. Essa remoção só pode acontecer
-- DEPOIS que packages/db/src/scripts/migrate-secrets-off-plaintext.ts rodar
-- contra uma instalação real (ver migration
-- 20260910203000_secret_provider_drop_plaintext, que faz só isso).

ALTER TABLE "secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "secrets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "secrets"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
