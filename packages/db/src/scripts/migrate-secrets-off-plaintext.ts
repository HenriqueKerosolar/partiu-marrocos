import { PrismaClient } from "@prisma/client";
import { withSystem } from "../tenant-db";
import { configurarSecret } from "../secret-provider";

/**
 * Procedimento operacional de migração — PM-BLOQ-001, passo 2/3.
 *
 * Uma migration SQL pura não alcança o SecretProvider (cifrar exige
 * `SECRET_PROVIDER_MASTER_KEY` e a lógica de `node:crypto` em
 * `secret-provider.ts`), então essa etapa não pode ser um arquivo em
 * `prisma/migrations/*.sql` — é um script real, para ser rodado uma vez por
 * instalação, DEPOIS da migration aditiva
 * (`20260910202656_secret_provider_add_columns`, que cria as colunas novas
 * mantendo as antigas) e ANTES da migration que remove as colunas antigas
 * (`20260910203000_secret_provider_drop_plaintext`).
 *
 * Para cada linha com valor em texto plano: cifra → grava em `secrets` →
 * grava o secretRef na coluna nova → zera a coluna antiga → confirma que
 * não sobrou texto plano. Idempotente: rodar de novo depois que tudo já foi
 * migrado não faz nada (WHERE ... IS NOT NULL não encontra mais linhas).
 *
 * Nunca loga o valor em si — só ids e contagens.
 */

export async function migrarAiApiKeyDosTenants(prisma: PrismaClient): Promise<number> {
  const pendentes = await withSystem(prisma, (tx) =>
    tx.$queryRaw<{ id: string; tenant_id: string; ai_api_key: string }[]>`
      SELECT id, id AS tenant_id, ai_api_key FROM tenants WHERE ai_api_key IS NOT NULL
    `,
  );

  for (const row of pendentes) {
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: row.tenant_id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: row.ai_api_key,
      actorType: "SISTEMA",
      actorLabel: "migracao-pm-bloq-001",
    });

    await withSystem(prisma, (tx) =>
      tx.$executeRaw`UPDATE tenants SET ai_api_key_secret_ref = ${secretRef}, ai_api_key = NULL WHERE id = ${row.id}`,
    );
  }

  return pendentes.length;
}

export async function migrarCredenciaisWhatsapp(prisma: PrismaClient): Promise<number> {
  const pendentes = await withSystem(prisma, (tx) =>
    tx.$queryRaw<{ id: string; tenant_id: string; access_token: string | null; app_secret: string | null }[]>`
      SELECT id, tenant_id, access_token, app_secret FROM whatsapp_accounts
      WHERE access_token IS NOT NULL OR app_secret IS NOT NULL
    `,
  );

  for (const row of pendentes) {
    let accessTokenSecretRef: string | undefined;
    let appSecretSecretRef: string | undefined;

    if (row.access_token) {
      const resultado = await configurarSecret(prisma, {
        tenantId: row.tenant_id,
        finalidade: "WHATSAPP_ACCESS_TOKEN",
        valor: row.access_token,
        actorType: "SISTEMA",
        actorLabel: "migracao-pm-bloq-001",
      });
      accessTokenSecretRef = resultado.secretRef;
    }

    if (row.app_secret) {
      const resultado = await configurarSecret(prisma, {
        tenantId: row.tenant_id,
        finalidade: "WHATSAPP_APP_SECRET",
        valor: row.app_secret,
        actorType: "SISTEMA",
        actorLabel: "migracao-pm-bloq-001",
      });
      appSecretSecretRef = resultado.secretRef;
    }

    await withSystem(prisma, (tx) =>
      tx.$executeRaw`
        UPDATE whatsapp_accounts
        SET access_token_secret_ref = COALESCE(${accessTokenSecretRef ?? null}, access_token_secret_ref),
            app_secret_secret_ref = COALESCE(${appSecretSecretRef ?? null}, app_secret_secret_ref),
            access_token = NULL,
            app_secret = NULL
        WHERE id = ${row.id}
      `,
    );
  }

  return pendentes.length;
}

export async function confirmarSemTextoPlano(prisma: PrismaClient): Promise<void> {
  const [tenantsRestantes, whatsappRestantes] = await withSystem(prisma, async (tx) => {
    const t = await tx.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM tenants WHERE ai_api_key IS NOT NULL`;
    const w = await tx.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM whatsapp_accounts WHERE access_token IS NOT NULL OR app_secret IS NOT NULL`;
    return [Number(t[0]!.c), Number(w[0]!.c)];
  });

  if (tenantsRestantes > 0 || whatsappRestantes > 0) {
    throw new Error(
      `Migração incompleta: ainda restam ${tenantsRestantes} tenant(s) e ${whatsappRestantes} conta(s) WhatsApp com valor em texto plano.`,
    );
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenantsMigrados = await migrarAiApiKeyDosTenants(prisma);
    const whatsappMigrados = await migrarCredenciaisWhatsapp(prisma);
    await confirmarSemTextoPlano(prisma);
    console.log(
      `Migração de secrets concluída: ${tenantsMigrados} tenant(s) (aiApiKey), ${whatsappMigrados} conta(s) WhatsApp (accessToken/appSecret). Nenhum valor foi impresso. Nenhum texto plano restante confirmado.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Falha na migração de secrets:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
