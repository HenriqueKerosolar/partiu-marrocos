import { prisma, withTenant, obterSecret } from "@partiumarrocos/db";
import { selecionarProvider, type TranslationProvider, type TranslationTask } from "./provider";

/**
 * Reaproveita a mesma chave/config de IA do tenant usada pelo Yalla
 * (Tenant.aiProvider/aiApiKeySecretRef, ver ai/yalla.ts:72-82) — é
 * literalmente a mesma chave OpenAI, não um segredo novo. Devolve null
 * (nunca lança) quando o tenant não tem IA configurada — quem chama decide
 * o que fazer (mesmo padrão fail-closed silencioso do Yalla).
 */
export async function resolverProviderTraducao(
  tenantId: string,
  tarefa: TranslationTask,
): Promise<{ provider: TranslationProvider; apiKey: string; providerNome: string } | null> {
  const tenant = await withTenant(prisma, tenantId, (tx) => tx.tenant.findUnique({ where: { id: tenantId } }));
  if (!tenant?.aiApiKeySecretRef || !tenant.aiProvider) return null;

  const apiKey = await obterSecret(prisma, {
    tenantId,
    secretRef: tenant.aiApiKeySecretRef,
    actorType: "AGENTE",
    actorLabel: "translation",
  });
  if (!apiKey) return null;

  return { provider: selecionarProvider(tarefa, apiKey), apiKey, providerNome: tenant.aiProvider };
}
