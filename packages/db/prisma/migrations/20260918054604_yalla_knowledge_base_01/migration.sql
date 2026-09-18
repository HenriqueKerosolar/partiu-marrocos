-- CreateEnum
CREATE TYPE "KnowledgeAnswerType" AS ENUM ('STATIC_KNOWLEDGE', 'OFFICIAL_DYNAMIC', 'TRIP_DYNAMIC', 'REALTIME_CONTEXT');

-- CreateEnum
CREATE TYPE "KnowledgeRiskLevel" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateTable
CREATE TABLE "knowledge_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "subcategoria" TEXT,
    "intencao" TEXT NOT NULL,
    "answer_type" "KnowledgeAnswerType" NOT NULL,
    "risk_level" "KnowledgeRiskLevel" NOT NULL DEFAULT 'BAIXO',
    "pergunta" TEXT NOT NULL,
    "variantes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resposta_base" TEXT,
    "pais" TEXT,
    "nacionalidade" TEXT,
    "fonte_tipo" TEXT,
    "fonte" TEXT,
    "ultima_verificacao" TIMESTAMP(3),
    "intervalo_revisao_dias" INTEGER,
    "requer_tool" BOOLEAN NOT NULL DEFAULT false,
    "tool_id" TEXT,
    "requer_contexto_viagem" BOOLEAN NOT NULL DEFAULT false,
    "requer_localizacao" BOOLEAN NOT NULL DEFAULT false,
    "requer_auth" BOOLEAN NOT NULL DEFAULT false,
    "politica_escalonamento" TEXT,
    "fallback" TEXT,
    "relacionados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_entries_tenant_id_idx" ON "knowledge_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "knowledge_entries_tenant_id_categoria_idx" ON "knowledge_entries"("tenant_id", "categoria");

-- CreateIndex
CREATE INDEX "knowledge_entries_tenant_id_answer_type_idx" ON "knowledge_entries"("tenant_id", "answer_type");

-- CreateIndex
CREATE INDEX "knowledge_entries_tenant_id_ativo_idx" ON "knowledge_entries"("tenant_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_entries_tenant_id_id_key" ON "knowledge_entries"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
