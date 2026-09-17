-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "translation_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "detected_language" TEXT,
ADD COLUMN     "translated_conteudo" TEXT,
ADD COLUMN     "translated_language" TEXT,
ADD COLUMN     "translated_media_type" TEXT,
ADD COLUMN     "translated_media_url" TEXT;

-- RenameIndex
ALTER INDEX "geolocation_pings_tenant_id_tracking_session_id_captured_a_idx" RENAME TO "geolocation_pings_tenant_id_tracking_session_id_captured_at_idx";
