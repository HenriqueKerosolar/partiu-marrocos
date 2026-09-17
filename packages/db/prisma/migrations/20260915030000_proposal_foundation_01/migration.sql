-- Proposal Foundation 01 (PM-NIGHT-RUN-01, Etapa 5) — tabela nova, nenhuma
-- alteração em tabela existente. Versionamento obrigatório é modelado por
-- auto-relação (substitui_proposta_id): uma proposta ENVIADA nunca é
-- reescrita, uma edição pós-envio cria uma nova linha (versao+1).

-- CreateEnum
CREATE TYPE "PropostaStatus" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'ENVIADA', 'ACEITA', 'RECUSADA', 'EXPIRADA', 'SUBSTITUIDA');

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "substitui_proposta_id" TEXT,
    "status" "PropostaStatus" NOT NULL DEFAULT 'RASCUNHO',
    "roteiro" TEXT,
    "datas_viagem" JSONB,
    "quantidade_passageiros" INTEGER,
    "servicos_incluidos" JSONB,
    "servicos_excluidos" JSONB,
    "moeda" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL,
    "preco_referencia" DOUBLE PRECISION,
    "custos" DOUBLE PRECISION,
    "condicoes" TEXT,
    "validade" TIMESTAMP(3) NOT NULL,
    "cotacao_cambio" JSONB,
    "condicao_excepcional" BOOLEAN NOT NULL DEFAULT false,
    "compromisso_externo_sensivel" BOOLEAN NOT NULL DEFAULT false,
    "gate_id" TEXT,
    "criado_por_id" TEXT,
    "enviada_em" TIMESTAMP(3),
    "aceita_em" TIMESTAMP(3),
    "recusada_em" TIMESTAMP(3),
    "motivo_recusa" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposals_tenant_id_idx" ON "proposals"("tenant_id");

-- CreateIndex
CREATE INDEX "proposals_tenant_id_lead_id_idx" ON "proposals"("tenant_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_tenant_id_id_key" ON "proposals"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tenant_id_lead_id_fkey" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "leads"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tenant_id_substitui_proposta_id_fkey" FOREIGN KEY ("tenant_id", "substitui_proposta_id") REFERENCES "proposals"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;
