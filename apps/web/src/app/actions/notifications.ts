"use server";

import { revalidatePath } from "next/cache";
import { prisma, listarNotificacoesDoUsuario, contarNaoLidas, marcarComoLida, marcarTodasComoLidas, type Notification } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";

/** Sempre escopado ao próprio usuário logado (`ctx.user.id`) — nunca aceita um userId por parâmetro, mesmo padrão de toda ação "minhas coisas" do produto. */
export async function listarMinhasNotificacoesAction(): Promise<Notification[]> {
  const ctx = await requireAuthContext();
  return listarNotificacoesDoUsuario(prisma, ctx.tenantId!, ctx.user.id);
}

export async function contarMinhasNaoLidasAction(): Promise<number> {
  const ctx = await requireAuthContext();
  return contarNaoLidas(prisma, ctx.tenantId!, ctx.user.id);
}

export async function marcarNotificacaoLidaAction(notificationId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  const r = await marcarComoLida(prisma, ctx.tenantId!, notificationId, ctx.user.id);
  revalidatePath("/notificacoes");
  if (!r.ok) return { error: "Notificação não encontrada." };
  return { ok: true };
}

export async function marcarTodasNotificacoesLidasAction(): Promise<{ ok: true; marcadas: number }> {
  const ctx = await requireAuthContext();
  const marcadas = await marcarTodasComoLidas(prisma, ctx.tenantId!, ctx.user.id);
  revalidatePath("/notificacoes");
  return { ok: true, marcadas };
}
