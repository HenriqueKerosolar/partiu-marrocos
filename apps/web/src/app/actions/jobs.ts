"use server";

import { revalidatePath } from "next/cache";
import { prisma, cancelarJob, reenviarJobManualmente } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

/** Cancela um job em andamento/pendente. Só Administrador por padrão (jobs.manage). */
export async function cancelarJobAction(jobId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "jobs.manage");

  const cancelou = await cancelarJob(prisma, { tenantId: ctx.tenantId!, jobId, actorType: "HUMANO", userId: ctx.user.id });
  if (!cancelou) return { error: "Job não encontrado ou já está em estado terminal." };

  revalidatePath("/jobs");
  return { ok: true };
}

/** Reenvia manualmente um job FAILED/DEAD_LETTER (zera tentativas). Só Administrador por padrão (jobs.manage). */
export async function reenviarJobAction(jobId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "jobs.manage");

  const reenviou = await reenviarJobManualmente(prisma, { tenantId: ctx.tenantId!, jobId, actorType: "HUMANO", userId: ctx.user.id });
  if (!reenviou) return { error: "Job não encontrado ou não está em FAILED/DEAD_LETTER." };

  revalidatePath("/jobs");
  return { ok: true };
}
