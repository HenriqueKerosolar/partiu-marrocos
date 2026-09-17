-- Travel Document Foundation 01 (PM-NIGHT-RUN-02, Etapa 4) — 2 tabelas
-- novas, nenhuma alteração em tabela existente. `traveler_documents` NÃO
-- tem coluna de arquivo/URL de propósito (privacy-by-design, §29 — upload
-- real fica YELLOW nesta rodada, sem storage seguro disponível).

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'EM_ANALISE', 'APROVADO', 'REJEITADO', 'EXPIRADO');

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traveler_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "traveler_id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDENTE',
    "enviado_em" TIMESTAMP(3),
    "revisado_em" TIMESTAMP(3),
    "revisado_por_id" TEXT,
    "motivo_rejeicao" TEXT,
    "validade_ate" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traveler_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_requirements_tenant_id_idx" ON "document_requirements"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_requirements_tenant_id_id_key" ON "document_requirements"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "traveler_documents_tenant_id_idx" ON "traveler_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "traveler_documents_tenant_id_traveler_id_idx" ON "traveler_documents"("tenant_id", "traveler_id");

-- CreateIndex
CREATE UNIQUE INDEX "traveler_documents_tenant_id_id_key" ON "traveler_documents"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "traveler_documents_tenant_id_traveler_id_requirement_id_key" ON "traveler_documents"("tenant_id", "traveler_id", "requirement_id");

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_documents" ADD CONSTRAINT "traveler_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_documents" ADD CONSTRAINT "traveler_documents_tenant_id_traveler_id_fkey" FOREIGN KEY ("tenant_id", "traveler_id") REFERENCES "travelers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_documents" ADD CONSTRAINT "traveler_documents_tenant_id_requirement_id_fkey" FOREIGN KEY ("tenant_id", "requirement_id") REFERENCES "document_requirements"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_documents" ADD CONSTRAINT "traveler_documents_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
