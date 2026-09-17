-- CreateEnum
CREATE TYPE "GateStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO', 'MODIFICADO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "GateCategoria" AS ENUM ('FINANCEIRO', 'COMERCIAL', 'PUBLICACAO_EXTERNA', 'ORCAMENTO_PUBLICIDADE', 'EXCLUSAO_DADO', 'ACAO_PRIVILEGIADA', 'ACAO_IRREVERSIVEL');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('HUMANO', 'AGENTE', 'SISTEMA');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_label" TEXT,
ADD COLUMN     "actor_type" "ActorType" NOT NULL DEFAULT 'HUMANO';

-- CreateTable
CREATE TABLE "gates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "categoria" "GateCategoria" NOT NULL,
    "status" "GateStatus" NOT NULL DEFAULT 'PENDENTE',
    "acao_proposta" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "risco_descricao" TEXT,
    "alternativas" JSONB,
    "solicitante_tipo" "ActorType" NOT NULL,
    "solicitante_label" TEXT,
    "solicitante_id" TEXT,
    "decisor_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "resultado" JSONB,
    "metadata" JSONB,
    "agent_id" TEXT,
    "execution_id" TEXT,
    "tool_id" TEXT,

    CONSTRAINT "gates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gates_tenant_id_idx" ON "gates"("tenant_id");

-- CreateIndex
CREATE INDEX "gates_tenant_id_status_idx" ON "gates"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gates_tenant_id_id_key" ON "gates"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entidade_entidade_id_idx" ON "audit_logs"("tenant_id", "entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "gates" ADD CONSTRAINT "gates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gates" ADD CONSTRAINT "gates_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gates" ADD CONSTRAINT "gates_decisor_id_fkey" FOREIGN KEY ("decisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

