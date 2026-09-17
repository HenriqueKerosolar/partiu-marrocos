-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "whatsapp_id" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "account_id" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "failed_reason" TEXT,
ADD COLUMN     "media_type" TEXT,
ADD COLUMN     "media_url" TEXT,
ADD COLUMN     "read_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "waba_id" TEXT,
    "display_phone" TEXT,
    "access_token" TEXT NOT NULL,
    "app_secret" TEXT,
    "verify_token" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_id_key" ON "whatsapp_accounts"("phone_number_id");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_tenant_id_idx" ON "whatsapp_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_tenant_id_id_key" ON "whatsapp_accounts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_tenant_id_whatsapp_id_key" ON "contacts"("tenant_id", "whatsapp_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_tenant_id_channel_contact_id_key" ON "conversations"("tenant_id", "channel", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_tenant_id_external_id_key" ON "messages"("tenant_id", "external_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "whatsapp_accounts"("tenant_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

