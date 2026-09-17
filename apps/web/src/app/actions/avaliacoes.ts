"use server";

import { revalidatePath } from "next/cache";
import { prisma, publicarDepoimento, despublicarDepoimento } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

export async function publicarDepoimentoAction(tripReviewId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "avaliacoes.manage");
  const r = await publicarDepoimento(prisma, { tenantId: ctx.tenantId!, tripReviewId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath("/avaliacoes");
  if (!r.ok) return { error: r.motivo === "SEM_CONSENTIMENTO" ? "O cliente não autorizou o uso como depoimento." : "Avaliação não encontrada." };
  return { ok: true };
}

export async function despublicarDepoimentoAction(tripReviewId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "avaliacoes.manage");
  const r = await despublicarDepoimento(prisma, { tenantId: ctx.tenantId!, tripReviewId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath("/avaliacoes");
  if (!r.ok) return { error: "Avaliação não encontrada." };
  return { ok: true };
}
