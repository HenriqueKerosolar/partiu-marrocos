-- PM-CONV-04 (macrobloco paralelo: Track A QR/Check-in/Boarding, Track C
-- Partner/Commission/Rewards, Track D Ouvidoria) — puramente aditivo.
-- Track B (Help/i18n) não tem migration: conteúdo de ajuda é módulo
-- TypeScript puro (packages/db/src/help/), sem tabela nova — decisão
-- registrada em docs/PM_CONV_04_RESULTADO.md.

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('AGENDADO', 'CHECKIN_REALIZADO', 'EMBARCADO', 'NO_SHOW', 'CANCELADO');

-- CreateEnum
CREATE TYPE "RewardClaimStatus" AS ENUM ('SOLICITADA', 'APROVADA', 'PAGA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "SupportTicketCategoria" AS ENUM ('RECLAMACAO', 'ELOGIO', 'DUVIDA', 'SOLICITACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "SupportTicketPrioridade" AS ENUM ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'RESOLVIDO', 'FECHADO');

-- CreateEnum
CREATE TYPE "SupportTicketAutorTipo" AS ENUM ('CLIENTE', 'EQUIPE');

-- AlterTable
ALTER TABLE "commissions" ADD COLUMN     "partner_id" TEXT,
ALTER COLUMN "beneficiario_id" DROP NOT NULL;

-- Integridade: exatamente um beneficiário (interno OU parceiro externo),
-- nunca os dois, nunca nenhum — garantido pelo banco, não só por convenção
-- de aplicação (§7C do comando).
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_beneficiario_xor_partner_check"
  CHECK (
    (beneficiario_id IS NOT NULL AND partner_id IS NULL)
    OR (beneficiario_id IS NULL AND partner_id IS NOT NULL)
  );

-- AlterTable
ALTER TABLE "gates" ADD COLUMN     "subject_fingerprint" TEXT;

-- CreateTable
CREATE TABLE "traveler_checkins" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "trip_group_id" TEXT NOT NULL,
    "traveler_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "status" "CheckInStatus" NOT NULL DEFAULT 'AGENDADO',
    "credencial_token_hash" TEXT,
    "credencial_emitida_em" TIMESTAMP(3),
    "credencial_expira_em" TIMESTAMP(3),
    "credencial_revogada_em" TIMESTAMP(3),
    "checkin_em" TIMESTAMP(3),
    "checkin_por_id" TEXT,
    "embarque_em" TIMESTAMP(3),
    "embarque_por_id" TEXT,
    "no_show_em" TIMESTAMP(3),
    "no_show_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traveler_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT,
    "contato" TEXT,
    "email" TEXT,
    "origem" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_referrals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_campaigns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "meta" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "moeda" TEXT NOT NULL,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_claims" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "status" "RewardClaimStatus" NOT NULL DEFAULT 'SOLICITADA',
    "gate_id" TEXT,
    "solicitada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paga_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "lead_id" TEXT,
    "categoria" "SupportTicketCategoria" NOT NULL,
    "prioridade" "SupportTicketPrioridade" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'ABERTO',
    "assunto" TEXT NOT NULL,
    "responsavel_id" TEXT,
    "origem" TEXT,
    "sla_vencimento" TIMESTAMP(3),
    "resolucao" TEXT,
    "avaliacao_nota" INTEGER,
    "avaliacao_comentario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "autor_tipo" "SupportTicketAutorTipo" NOT NULL,
    "autor_user_id" TEXT,
    "corpo" TEXT NOT NULL,
    "conversation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "traveler_checkins_credencial_token_hash_key" ON "traveler_checkins"("credencial_token_hash");

-- CreateIndex
CREATE INDEX "traveler_checkins_tenant_id_idx" ON "traveler_checkins"("tenant_id");

-- CreateIndex
CREATE INDEX "traveler_checkins_tenant_id_trip_group_id_idx" ON "traveler_checkins"("tenant_id", "trip_group_id");

-- CreateIndex
CREATE INDEX "traveler_checkins_tenant_id_traveler_id_idx" ON "traveler_checkins"("tenant_id", "traveler_id");

-- CreateIndex
CREATE INDEX "traveler_checkins_tenant_id_booking_id_idx" ON "traveler_checkins"("tenant_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "traveler_checkins_tenant_id_id_key" ON "traveler_checkins"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "traveler_checkins_tenant_id_trip_group_id_traveler_id_key" ON "traveler_checkins"("tenant_id", "trip_group_id", "traveler_id");

-- CreateIndex
CREATE INDEX "partners_tenant_id_idx" ON "partners"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "partners_tenant_id_id_key" ON "partners"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "partners_tenant_id_codigo_key" ON "partners"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "partner_referrals_tenant_id_idx" ON "partner_referrals"("tenant_id");

-- CreateIndex
CREATE INDEX "partner_referrals_tenant_id_partner_id_idx" ON "partner_referrals"("tenant_id", "partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_referrals_tenant_id_id_key" ON "partner_referrals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_referrals_tenant_id_lead_id_key" ON "partner_referrals"("tenant_id", "lead_id");

-- CreateIndex
CREATE INDEX "reward_campaigns_tenant_id_idx" ON "reward_campaigns"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_campaigns_tenant_id_id_key" ON "reward_campaigns"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "reward_claims_tenant_id_idx" ON "reward_claims"("tenant_id");

-- CreateIndex
CREATE INDEX "reward_claims_tenant_id_partner_id_idx" ON "reward_claims"("tenant_id", "partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_claims_tenant_id_id_key" ON "reward_claims"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_claims_tenant_id_campaign_id_partner_id_key" ON "reward_claims"("tenant_id", "campaign_id", "partner_id");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_idx" ON "support_tickets"("tenant_id");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_status_idx" ON "support_tickets"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_lead_id_idx" ON "support_tickets"("tenant_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_tenant_id_id_key" ON "support_tickets"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_tenant_id_protocolo_key" ON "support_tickets"("tenant_id", "protocolo");

-- CreateIndex
CREATE INDEX "support_ticket_messages_tenant_id_idx" ON "support_ticket_messages"("tenant_id");

-- CreateIndex
CREATE INDEX "support_ticket_messages_tenant_id_ticket_id_idx" ON "support_ticket_messages"("tenant_id", "ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_ticket_messages_tenant_id_id_key" ON "support_ticket_messages"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "commissions_tenant_id_partner_id_idx" ON "commissions"("tenant_id", "partner_id");

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_tenant_id_partner_id_fkey" FOREIGN KEY ("tenant_id", "partner_id") REFERENCES "partners"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_checkins" ADD CONSTRAINT "traveler_checkins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_checkins" ADD CONSTRAINT "traveler_checkins_tenant_id_trip_group_id_fkey" FOREIGN KEY ("tenant_id", "trip_group_id") REFERENCES "trip_groups"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_checkins" ADD CONSTRAINT "traveler_checkins_tenant_id_traveler_id_fkey" FOREIGN KEY ("tenant_id", "traveler_id") REFERENCES "travelers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_checkins" ADD CONSTRAINT "traveler_checkins_tenant_id_booking_id_fkey" FOREIGN KEY ("tenant_id", "booking_id") REFERENCES "bookings"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_checkins" ADD CONSTRAINT "traveler_checkins_checkin_por_id_fkey" FOREIGN KEY ("checkin_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_checkins" ADD CONSTRAINT "traveler_checkins_embarque_por_id_fkey" FOREIGN KEY ("embarque_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_checkins" ADD CONSTRAINT "traveler_checkins_no_show_por_id_fkey" FOREIGN KEY ("no_show_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_referrals" ADD CONSTRAINT "partner_referrals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_referrals" ADD CONSTRAINT "partner_referrals_tenant_id_partner_id_fkey" FOREIGN KEY ("tenant_id", "partner_id") REFERENCES "partners"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_referrals" ADD CONSTRAINT "partner_referrals_tenant_id_lead_id_fkey" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "leads"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_campaigns" ADD CONSTRAINT "reward_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_tenant_id_campaign_id_fkey" FOREIGN KEY ("tenant_id", "campaign_id") REFERENCES "reward_campaigns"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_tenant_id_partner_id_fkey" FOREIGN KEY ("tenant_id", "partner_id") REFERENCES "partners"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_lead_id_fkey" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "leads"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_tenant_id_ticket_id_fkey" FOREIGN KEY ("tenant_id", "ticket_id") REFERENCES "support_tickets"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_autor_user_id_fkey" FOREIGN KEY ("autor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_tenant_id_conversation_id_fkey" FOREIGN KEY ("tenant_id", "conversation_id") REFERENCES "conversations"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

