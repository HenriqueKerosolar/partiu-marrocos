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

-- WhatsApp Cloud API (ver src/cross-tenant.ts: o webhook resolve a conta via
-- rls_bypass() antes de conhecer o tenant, igual ao login).
ALTER TABLE "whatsapp_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "whatsapp_accounts"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Domínio de veículo do KeroCar — REMOVIDO deste repositório em 15/09/2026
-- (PM-SANEAMENTO-01). KeroCar é produto próprio, vive em D:\Projetos\OBD2;
-- esta cópia era resíduo compartilhado da fundação original (tabelas
-- devices/vehicles/telemetry_events/dtc_events/security_events/
-- maintenance_records, confirmadas vazias antes da remoção — ver migration
-- 20260915000000_remove_kerocar_domain e docs/PM_SANEAMENTO_01_FECHAMENTO.md).
-- A policy de RLS que existia aqui (idêntica ao padrão tenant_isolation de
-- toda outra tabela deste arquivo) foi removida junto com as tabelas.

-- Gate/Approval (T1). CHECK garante em banco que nenhuma decisão sai de
-- PENDENTE sem decisor_id — que só pode ser um User real (FK), nunca um
-- agente/sistema (ver comentário no schema.prisma sobre por que isso torna
-- autoaprovação por IA estruturalmente impossível, não só validada em código).
ALTER TABLE "gates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "gates"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Audit log append-only real em banco (T1) — não só convenção de aplicação.
-- rls_bypass() (mesma flag do withSystem) é a ÚNICA exceção — necessária pra
-- não quebrar DELETE em cascata legítimo (ex.: apagar um Tenant inteiro
-- apaga seus audit_logs via ON DELETE CASCADE). Fora de withSystem, o
-- append-only é absoluto — achado real durante a implementação (o teste de
-- cleanup do próprio teste de isolamento pegou isso).
CREATE OR REPLACE FUNCTION audit_logs_no_update_delete() RETURNS trigger AS $$
BEGIN
  IF rls_bypass() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_logs é append-only — UPDATE/DELETE não são permitidos (tentativa em id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_no_update_delete();

CREATE TRIGGER trg_audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_no_update_delete();

-- Secret Provider (PM-BLOQ-001). Tenant/WhatsappAccount guardam só um
-- secretRef opaco para uma linha aqui — RLS garante que um tenant nunca
-- alcança o secretRef de outro, mesmo que o id vaze por algum outro canal.
ALTER TABLE "secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "secrets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "secrets"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Cost Control (T2). model_prices fica de fora de propósito (catálogo
-- global de preço de mercado, não configuração de tenant — mesmo
-- tratamento de permissions).
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

-- cost_events é append-only (ledger de custo) — mesma exceção via
-- rls_bypass() de audit_logs, aplicada já corrigida desde o início (não é
-- um achado novo, é o mesmo padrão de T1 reaplicado de propósito).
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

-- Tool Broker (T3). Nem agent_grants nem tool_calls são append-only —
-- tool_calls precisa de UPDATE real (STARTED → COMPLETED/FAILED/TIMEOUT).
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

-- Attribution (T6).
ALTER TABLE "attribution_touches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attribution_touches" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attribution_touches"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Job/Execution Engine (T5).
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

-- Proposal Foundation 01 (PM-NIGHT-RUN-02).
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proposals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "proposals"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Booking Foundation 01.
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

-- Payment Foundation 01.
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payments"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Finance Core Real 01.
ALTER TABLE "commercial_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commercial_policies"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "commissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commissions"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Travel Document Foundation 01.
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

-- Trip Operation Foundation 01.
ALTER TABLE "trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trips" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trips"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_itinerary_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_itinerary_days" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_itinerary_days"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_activities" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_activities"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_checklist_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_checklist_items"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- PM-CONV-03 — Core Turístico (crew, veículos, grupos operacionais, cuidados do passageiro).
ALTER TABLE "traveler_cares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "traveler_cares" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "traveler_cares"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "professionals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "professionals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "professionals"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "suppliers"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "tour_vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tour_vehicles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tour_vehicles"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_groups" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_groups"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_group_professionals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_group_professionals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_group_professionals"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "trip_activity_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_activity_progress" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_activity_progress"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- PM-CONV-04 — Core Expansion (check-in/QR, parceiros, premiações, ouvidoria).
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

-- PM-CONV-05a — GPS/Mapas/Live Location.
ALTER TABLE "tracking_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tracking_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tracking_sessions"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

ALTER TABLE "geolocation_pings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "geolocation_pings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "geolocation_pings"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- PM-CONV-05b — Ocorrências operacionais.
ALTER TABLE "trip_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_incidents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_incidents"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- PM-CONV-11 — este arquivo estava desatualizado desde T6 (achado, confirmado
-- por auditoria de segurança: comparação direta de todo model tenantId-bearing
-- em schema.prisma contra as migrations `*enable_rls*` reais — a PROTEÇÃO em
-- banco sempre esteve correta e completa em todas as tabelas acima; só esta
-- REFERÊNCIA cumulativa (documentação, nunca lida em runtime) estava
-- desatualizada). Atualizado nesta rodada para refletir 100% das tabelas
-- tenant-scoped reais — nenhuma lacuna de proteção encontrada, só de doc.

-- Tabelas sem RLS por design:
--   - tenants: é o próprio registro de tenants, não tem tenant_id.
--   - users: identidade global de login (vínculo por tenant via memberships).
--   - permissions: catálogo global.
--   - model_prices: catálogo global de preço de mercado (T2), não dado de tenant.
--   - sessions: tenant_id nulo antes da seleção de empresa; protegida por
--     acesso exclusivo via chave primária (ver comentário no schema.prisma).
--   - worker_heartbeats (T5): operacional/observabilidade do próprio motor de
--     jobs, sem tenant_id — não é dado de negócio de nenhum tenant.
