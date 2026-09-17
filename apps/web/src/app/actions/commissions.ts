"use server";

import { revalidatePath } from "next/cache";
import { prisma, criarComissao, confirmarComissao, cancelarComissao, solicitarPagamentoComissao, confirmarPagamentoComissaoAposGate } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

export async function criarComissaoAction(leadId: string, bookingId: string, beneficiarioId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "comissoes.manage");

  const valor = Number(String(formData.get("valor") ?? "").trim());
  if (!(valor > 0)) return { error: "Informe um valor válido." };
  const moeda = String(formData.get("moeda") ?? "BRL").trim() || "BRL";
  const percentualRaw = String(formData.get("percentual") ?? "").trim();
  const baseCalculoRaw = String(formData.get("baseCalculo") ?? "").trim();

  const r = await criarComissao(prisma, {
    tenantId: ctx.tenantId!,
    bookingId,
    beneficiarioId,
    valor,
    moeda,
    percentual: percentualRaw ? Number(percentualRaw) / 100 : null,
    baseCalculo: baseCalculoRaw ? Number(baseCalculoRaw) : null,
    criadoPorId: ctx.user.id,
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: "Não foi possível criar a comissão." };
  return { ok: true };
}

export async function confirmarComissaoAction(leadId: string, commissionId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "comissoes.manage");
  const r = await confirmarComissao(prisma, { tenantId: ctx.tenantId!, commissionId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/leads/${leadId}`);
  return r.ok ? { ok: true } : { error: "Não foi possível confirmar a comissão." };
}

export async function cancelarComissaoAction(leadId: string, commissionId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "comissoes.manage");
  const r = await cancelarComissao(prisma, { tenantId: ctx.tenantId!, commissionId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/leads/${leadId}`);
  return r.ok ? { ok: true } : { error: "Não foi possível cancelar a comissão." };
}

export async function solicitarPagamentoComissaoAction(leadId: string, commissionId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "comissoes.pagar");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!motivo) return { error: "Informe o motivo/justificativa do pagamento." };

  const r = await solicitarPagamentoComissao(prisma, { tenantId: ctx.tenantId!, commissionId, motivo, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: r.motivo === "STATUS_NAO_PERMITE_PAGAMENTO" ? "Só é possível solicitar pagamento de uma comissão confirmada." : "Comissão não encontrada." };
  return { ok: true };
}

export async function verificarPagamentoComissaoAction(leadId: string, commissionId: string): Promise<{ ok?: boolean; error?: string; status?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "comissoes.pagar");
  const r = await confirmarPagamentoComissaoAposGate(prisma, { tenantId: ctx.tenantId!, commissionId });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: "Comissão ou Gate não encontrado." };
  return { ok: true, status: r.status };
}
