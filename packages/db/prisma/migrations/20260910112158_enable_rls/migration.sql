-- Isolamento multi-tenant via Row Level Security, fail-closed.
-- Porte quase literal do CongáOne (packages/db/prisma/rls.sql), que por sua
-- vez segue o padrão do MercadoEase (ADR-005): uma única role de aplicação
-- (dona do schema) + duas funções auxiliares de sessão, em vez de duas roles
-- Postgres separadas.
--
-- Este arquivo é a referência cumulativa de todas as policies já aplicadas
-- (via migrations separadas — não é para rodar de uma vez só; ver as pastas
-- em prisma/migrations/*_rls* para o que já foi de fato aplicado quando).
-- Para uma tabela nova: `prisma migrate dev --create-only --name enable_rls_x`,
-- colar o trecho correspondente no migration.sql gerado, `prisma migrate dev`
-- para aplicar, e então acrescentar aqui para manter a documentação em dia.

-- Retorna text, não uuid: os ids no schema Prisma são TEXT (String +
-- @default(uuid()) só define o formato do valor gerado, a coluna em si é
-- TEXT) — current_tenant_id() precisa bater com o tipo real de tenant_id
-- para a comparação na policy funcionar sem cast.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '');
$$ LANGUAGE sql STABLE;

-- Escape hatch explícito para operações legitimamente cross-tenant (ex.:
-- "a quais empresas este usuário pertence" no login, antes de haver tenant
-- selecionado). Setado só dentro de withSystem() (packages/db/src/tenant-db.ts),
-- nunca como padrão de uma conexão.
CREATE OR REPLACE FUNCTION rls_bypass() RETURNS boolean AS $$
  SELECT current_setting('app.bypass_rls', true) = 'on';
$$ LANGUAGE sql STABLE;

-- A mesma role que roda as migrations é a role de runtime da aplicação.
-- FORCE ROW LEVEL SECURITY garante que a policy vale mesmo para o dono das
-- tabelas — sem isso, ser dono já bypassaria RLS e rls_bypass() seria inútil
-- como controle (qualquer query passaria sempre).

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "memberships"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "roles"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- role_permissions não tem tenant_id próprio; herda o tenant do Role.
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "role_permissions"
  USING (rls_bypass() OR role_id IN (SELECT id FROM "roles" WHERE tenant_id = current_tenant_id()))
  WITH CHECK (rls_bypass() OR role_id IN (SELECT id FROM "roles" WHERE tenant_id = current_tenant_id()));

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contacts"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "pipelines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipelines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pipelines"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stages"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "leads"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conversations"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "messages"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tasks"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notes"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Tabelas sem RLS por design:
--   - tenants: é o próprio registro de tenants, não tem tenant_id.
--   - users: identidade global de login (vínculo por tenant via memberships).
--   - permissions: catálogo global.
--   - sessions: tenant_id nulo antes da seleção de empresa; protegida por
--     acesso exclusivo via chave primária (ver comentário no schema.prisma).
