-- PM-BLOQ-001 (Secret Provider) — passo 1/2 da migração de Tenant.aiApiKey e
-- WhatsappAccount.accessToken/appSecret para fora do texto plano.
--
-- Editado à mão a partir do que `prisma migrate dev` gerou por padrão: o
-- diff automático já queria fazer DROP COLUMN das colunas antigas nesta
-- mesma migration — recusado deliberadamente aqui. Enquanto existir uma
-- instalação real com valor em texto plano nessas colunas, essa migração só
-- pode ser puramente aditiva: as colunas antigas continuam existindo (e são
-- lidas por packages/db/src/scripts/migrate-secrets-off-plaintext.ts) até a
-- migração de dados confirmar que cada linha já tem seu secretRef.
-- access_token_secret_ref nasce NULLABLE aqui pelo mesmo motivo (a coluna
-- final é NOT NULL, mas só pode virar isso depois que toda linha existente
-- já tiver sido migrada) — ver migration
-- 20260910203000_secret_provider_drop_plaintext, que remove as colunas
-- antigas e restaura o NOT NULL, só depois do script de dados já ter
-- rodado.

-- CreateEnum
CREATE TYPE "SecretFinalidade" AS ENUM ('AI_PROVIDER_API_KEY', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET');

-- AlterTable (aditivo — coluna antiga "ai_api_key" preservada por ora)
ALTER TABLE "tenants" ADD COLUMN "ai_api_key_secret_ref" TEXT;

-- AlterTable (aditivo — colunas antigas "access_token"/"app_secret" preservadas por ora)
-- access_token era NOT NULL; relaxado aqui de propósito — o script de dados
-- (passo 2) precisa poder zerá-la depois de migrar o valor para "secrets",
-- e só a migration de DROP COLUMN (passo 3) remove a coluna de vez.
ALTER TABLE "whatsapp_accounts" ALTER COLUMN "access_token" DROP NOT NULL;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "access_token_secret_ref" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "app_secret_secret_ref" TEXT;

-- CreateTable
CREATE TABLE "secrets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "finalidade" "SecretFinalidade" NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "algoritmo" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "key_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "secrets_tenant_id_idx" ON "secrets"("tenant_id");

-- CreateIndex
CREATE INDEX "secrets_tenant_id_finalidade_idx" ON "secrets"("tenant_id", "finalidade");

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
