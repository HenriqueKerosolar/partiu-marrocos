"use server";

import { revalidatePath } from "next/cache";
import { prisma, withTenant, configurarSecret, rotacionarSecret, submeterJob } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { drenarJobsPendentes } from "@/lib/jobs/drain";
import "@/lib/jobs"; // registra translation.enviar_traduzido antes do submeterJob abaixo

/**
 * Cadastro da conta WhatsApp Cloud API do tenant — "cada cliente terá a sua"
 * (config sob demanda, sem credencial real hardcoded em lugar nenhum).
 * `whatsapp.manage` é permissão de administrador (a conta guarda o access
 * token/app secret reais da Meta). PM-BLOQ-001: accessToken/appSecret nunca
 * são escritos em `WhatsappAccount` — só os `secretRef` devolvidos pelo
 * SecretProvider. `verifyToken` continua em texto plano de propósito (ver
 * comentário em schema.prisma/cross-tenant.ts — a Meta faz um GET de
 * handshake nele antes de qualquer tenant ser conhecido).
 */
export async function salvarContaWhatsapp(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "whatsapp.manage");

  const label = String(formData.get("label") ?? "").trim();
  const phoneNumberId = String(formData.get("phoneNumberId") ?? "").trim();
  const accessToken = String(formData.get("accessToken") ?? "").trim();
  const appSecret = String(formData.get("appSecret") ?? "").trim();
  const verifyToken = String(formData.get("verifyToken") ?? "").trim();

  if (!label || !phoneNumberId || !accessToken || !verifyToken) {
    return { error: "Preencha nome, phone number ID, access token e verify token." };
  }

  const ator = { actorType: "HUMANO" as const, userId: ctx.user.id };

  await withTenant(prisma, ctx.tenantId!, async (tx) => {
    const existente = await tx.whatsappAccount.findFirst({ where: { tenantId: ctx.tenantId!, phoneNumberId } });

    const accessTokenRotacionado = existente
      ? await rotacionarSecret(prisma, { tenantId: ctx.tenantId!, secretRef: existente.accessTokenSecretRef, novoValor: accessToken, finalidade: "WHATSAPP_ACCESS_TOKEN", ...ator })
      : null;
    const accessTokenSecretRef = accessTokenRotacionado
      ? accessTokenRotacionado.secretRef
      : (await configurarSecret(prisma, { tenantId: ctx.tenantId!, finalidade: "WHATSAPP_ACCESS_TOKEN", valor: accessToken, ...ator })).secretRef;

    let appSecretSecretRef: string | null = existente?.appSecretSecretRef ?? null;
    if (appSecret) {
      const appSecretRotacionado = appSecretSecretRef
        ? await rotacionarSecret(prisma, { tenantId: ctx.tenantId!, secretRef: appSecretSecretRef, novoValor: appSecret, finalidade: "WHATSAPP_APP_SECRET", ...ator })
        : null;
      appSecretSecretRef = appSecretRotacionado
        ? appSecretRotacionado.secretRef
        : (await configurarSecret(prisma, { tenantId: ctx.tenantId!, finalidade: "WHATSAPP_APP_SECRET", valor: appSecret, ...ator })).secretRef;
    }

    if (existente) {
      await tx.whatsappAccount.update({
        where: { id: existente.id },
        data: { label, accessTokenSecretRef, appSecretSecretRef, verifyToken, connectedAt: new Date() },
      });
    } else {
      await tx.whatsappAccount.create({
        data: { tenantId: ctx.tenantId!, label, phoneNumberId, accessTokenSecretRef, appSecretSecretRef, verifyToken, connectedAt: new Date() },
      });
    }
  });

  revalidatePath("/canais");
  return { ok: true };
}

/**
 * Envia uma resposta manual do operador numa conversa (WhatsApp ou webchat).
 *
 * PM-TRANSLATE-01: não manda mais pelo WhatsApp de forma síncrona aqui —
 * grava a Message com o texto ORIGINAL do atendente e enfileira
 * `translation.enviar_traduzido` (mesmo motivo do T5 pra
 * `whatsapp.enviar_mensagem`: uma falha transitória de rede não pode perder
 * a resposta). Esse job traduz pro idioma do cliente e entrega na mesma
 * modalidade que ele usou por último (texto ou áudio) — em WEBCHAT não há
 * envio externo, o widget do site lê a tradução por polling na própria
 * Message.
 */
export async function responderWhatsapp(conversationId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "atendimento.manage");

  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return { error: "Escreva uma mensagem." };

  const conversation = await withTenant(prisma, ctx.tenantId!, (tx) =>
    tx.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true, account: true },
    }),
  );
  if (!conversation) return { error: "Conversa inválida." };
  if (conversation.channel === "WHATSAPP" && !conversation.account) {
    return { error: "Esta conversa não tem uma conta WhatsApp associada — reconfigure em Canais." };
  }
  if (conversation.channel !== "WHATSAPP" && conversation.channel !== "WEBCHAT") {
    return { error: "Canal de conversa não suportado ainda." };
  }

  const messageId = await withTenant(prisma, ctx.tenantId!, async (tx) => {
    const message = await tx.message.create({
      data: {
        tenantId: ctx.tenantId!,
        conversationId: conversation.id,
        direction: "SAIDA",
        senderType: "HUMANO",
        conteudo: texto,
      },
    });
    await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    return message.id;
  });

  await submeterJob(prisma, {
    tenantId: ctx.tenantId!,
    type: "translation.enviar_traduzido",
    payload: { messageId },
    priority: 10,
    source: "inbox-resposta-manual",
    actorType: "HUMANO",
    userId: ctx.user.id,
  });

  // A Vercel (serverless) não roda o worker dedicado continuamente — drena
  // na hora o job de tradução/entrega que acabou de ser enfileirado.
  await drenarJobsPendentes().catch((e) => console.error("[responderWhatsapp] falha ao drenar jobs:", e));

  revalidatePath(`/inbox`);
  return { ok: true };
}
