"use server";

import { revalidatePath } from "next/cache";
import { prisma, criarRequisito, desativarRequisito, moverStatusDocumento, type DocumentStatus } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

export async function criarRequisitoAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "documentos.manage");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe o nome do requisito." };

  await criarRequisito(prisma, {
    tenantId: ctx.tenantId!,
    nome,
    descricao: String(formData.get("descricao") ?? "").trim() || null,
    obrigatorio: formData.get("obrigatorio") === "on",
  });
  revalidatePath("/documentos");
  return { ok: true };
}

export async function desativarRequisitoAction(requirementId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "documentos.manage");

  const ok = await desativarRequisito(prisma, { tenantId: ctx.tenantId!, requirementId });
  revalidatePath("/documentos");
  return ok ? { ok: true } : { error: "Requisito não encontrado." };
}

export async function moverStatusDocumentoAction(
  leadId: string,
  travelerDocumentId: string,
  novoStatus: DocumentStatus,
  formData?: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "documentos.manage");

  const motivoRejeicao = formData ? String(formData.get("motivoRejeicao") ?? "").trim() || null : undefined;
  const validadeRaw = formData ? String(formData.get("validadeAte") ?? "").trim() : "";

  const r = await moverStatusDocumento(prisma, {
    tenantId: ctx.tenantId!,
    travelerDocumentId,
    novoStatus,
    motivoRejeicao,
    validadeAte: validadeRaw ? new Date(validadeRaw) : undefined,
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: r.motivo === "TRANSICAO_INVALIDA" ? "Essa transição de status não é permitida." : "Documento não encontrado." };
  return { ok: true };
}
