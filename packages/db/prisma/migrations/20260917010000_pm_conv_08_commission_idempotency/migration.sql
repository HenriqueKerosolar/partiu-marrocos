-- PM-CONV-08 — achado real: Commission nunca ganhou idempotencyKey, ao
-- contrário de Payment/CostEvent (mesmo domínio de risco: criação
-- duplicada por duplo clique/retry de rede). Puramente aditiva — coluna
-- nova nulável, nenhuma alteração em coluna existente.

-- AlterTable
ALTER TABLE "commissions" ADD COLUMN "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "commissions_tenant_id_idempotency_key_key" ON "commissions"("tenant_id", "idempotency_key");
