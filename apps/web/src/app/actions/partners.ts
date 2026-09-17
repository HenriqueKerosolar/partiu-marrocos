"use server";

import { revalidatePath } from "next/cache";
import { prisma, criarPartner, editarPartner, criarRewardCampaign } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

export async function criarPartnerAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "parceiros.manage");
  const nome = String(formData.get("nome") ?? "").trim();
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  if (!nome || !codigo) return { error: "Informe nome e código." };

  const r = await criarPartner(prisma, {
    tenantId: ctx.tenantId!,
    nome,
    codigo,
    tipo: String(formData.get("tipo") ?? "").trim() || null,
    contato: String(formData.get("contato") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath("/parceiros");
  if (!r.ok) return { error: "Já existe um parceiro com esse código." };
  return { ok: true };
}

export async function alternarAtivoPartnerAction(partnerId: string, ativo: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "parceiros.manage");
  const r = await editarPartner(prisma, { tenantId: ctx.tenantId!, partnerId, ativo, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath("/parceiros");
  return r.ok ? { ok: true } : { error: "Parceiro não encontrado." };
}

export async function criarRewardCampaignAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "premiacoes.manage");
  const nome = String(formData.get("nome") ?? "").trim();
  const meta = Number(formData.get("meta"));
  const valor = Number(formData.get("valor"));
  const moeda = String(formData.get("moeda") ?? "BRL").trim();
  const dataInicioRaw = String(formData.get("dataInicio") ?? "").trim();
  const dataFimRaw = String(formData.get("dataFim") ?? "").trim();
  if (!nome || !dataInicioRaw || !dataFimRaw) return { error: "Preencha todos os campos." };

  const r = await criarRewardCampaign(prisma, {
    tenantId: ctx.tenantId!,
    nome,
    meta,
    valor,
    moeda,
    dataInicio: new Date(dataInicioRaw),
    dataFim: new Date(dataFimRaw),
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath("/premiacoes");
  if (!r.ok) return { error: r.motivo === "META_INVALIDA" ? "Meta inválida (número inteiro ≥ 1)." : "Data de fim antes da data de início." };
  return { ok: true };
}
