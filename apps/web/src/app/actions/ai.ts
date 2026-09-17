"use server";

import { revalidatePath } from "next/cache";
import { prisma, withTenant, configurarSecret, rotacionarSecret, removerSecret } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

/**
 * Configura (ou troca) o provider/chave de IA do tenant (agente Yalla).
 * Mesma permissão do WhatsApp — contém segredo. A chave em si nunca é
 * escrita em `Tenant` (PM-BLOQ-001) — só o `secretRef` devolvido pelo
 * SecretProvider (ver packages/db/src/secret-provider.ts).
 */
export async function salvarConfigIA(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "whatsapp.manage");

  const provider = String(formData.get("provider") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (provider !== "anthropic" && provider !== "openai") return { error: "Escolha um provedor válido." };
  if (!apiKey) return { error: "Informe a chave de API." };

  const tenant = await withTenant(prisma, ctx.tenantId!, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId! } }));
  const ator = { actorType: "HUMANO" as const, userId: ctx.user.id };

  // Chave existente => rotaciona (mantém o mesmo secretRef, código de
  // domínio não muda). Sem chave ainda => configura pela primeira vez.
  let secretRef = tenant.aiApiKeySecretRef;
  const rotacionado = secretRef
    ? await rotacionarSecret(prisma, { tenantId: ctx.tenantId!, secretRef, novoValor: apiKey, finalidade: "AI_PROVIDER_API_KEY", ...ator })
    : null;
  if (rotacionado) {
    secretRef = rotacionado.secretRef;
  } else {
    // Ou não havia secretRef, ou ele estava órfão (não deveria acontecer,
    // mas não é motivo para travar o usuário) — configura como novo.
    secretRef = (await configurarSecret(prisma, { tenantId: ctx.tenantId!, finalidade: "AI_PROVIDER_API_KEY", valor: apiKey, ...ator })).secretRef;
  }

  await withTenant(prisma, ctx.tenantId!, (tx) =>
    tx.tenant.update({ where: { id: ctx.tenantId! }, data: { aiProvider: provider, aiApiKeySecretRef: secretRef } }),
  );

  revalidatePath("/canais");
  return { ok: true };
}

/** Desliga o Yalla do tenant (mantém a chave salva, só limpa o provider — reversível). */
export async function desligarIA(): Promise<{ ok?: boolean }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "whatsapp.manage");
  await withTenant(prisma, ctx.tenantId!, (tx) => tx.tenant.update({ where: { id: ctx.tenantId! }, data: { aiProvider: null } }));
  revalidatePath("/canais");
  return { ok: true };
}

/**
 * Remove definitivamente a chave de IA salva (diferente de `desligarIA`,
 * que só limpa o provider e mantém a chave para religar depois). Ação
 * separada e explícita — a UI nunca oferece "mostrar chave atual", só
 * configurar/trocar/remover/ver status.
 */
export async function removerChaveIA(): Promise<{ ok?: boolean }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "whatsapp.manage");

  const tenant = await withTenant(prisma, ctx.tenantId!, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId! } }));
  if (tenant.aiApiKeySecretRef) {
    await removerSecret(prisma, {
      tenantId: ctx.tenantId!,
      secretRef: tenant.aiApiKeySecretRef,
      finalidade: "AI_PROVIDER_API_KEY",
      actorType: "HUMANO",
      userId: ctx.user.id,
    });
  }
  await withTenant(prisma, ctx.tenantId!, (tx) => tx.tenant.update({ where: { id: ctx.tenantId! }, data: { aiProvider: null, aiApiKeySecretRef: null } }));

  revalidatePath("/canais");
  return { ok: true };
}
