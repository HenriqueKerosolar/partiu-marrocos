-- PM-BLOQ-001 (Secret Provider) — passo 3/3: remove as colunas de texto
-- plano definitivamente. Só é seguro rodar esta migration DEPOIS que
-- packages/db/src/scripts/migrate-secrets-off-plaintext.ts já confirmou (via
-- confirmarSemTextoPlano) que nenhuma linha tem mais valor nas colunas
-- antigas — rodado nesta mesma sessão antes desta migration ser criada.
--
-- access_token_secret_ref volta a ser NOT NULL aqui (era obrigatório antes
-- como access_token; toda conta WhatsApp precisa de um token configurado).
-- app_secret_secret_ref continua nullable (app_secret já era opcional).

ALTER TABLE "tenants" DROP COLUMN "ai_api_key";

ALTER TABLE "whatsapp_accounts" DROP COLUMN "access_token";
ALTER TABLE "whatsapp_accounts" DROP COLUMN "app_secret";
ALTER TABLE "whatsapp_accounts" ALTER COLUMN "access_token_secret_ref" SET NOT NULL;
