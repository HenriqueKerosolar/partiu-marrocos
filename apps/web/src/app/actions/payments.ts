"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  criarPayment,
  registrarResultadoPayment,
  solicitarEstornoPayment,
  confirmarEstornoAposAprovacaoGate,
  type PaymentStatus,
} from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

export async function criarPaymentAction(leadId: string, bookingId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "payments.manage");

  const valorRaw = String(formData.get("valor") ?? "").trim();
  const valor = Number(valorRaw);
  if (!valorRaw || !(valor > 0)) return { error: "Informe um valor válido." };
  const moeda = String(formData.get("moeda") ?? "BRL").trim() || "BRL";
  const vencimentoRaw = String(formData.get("vencimento") ?? "").trim();
  const method = String(formData.get("method") ?? "").trim() || null;

  const r = await criarPayment(prisma, {
    tenantId: ctx.tenantId!,
    bookingId,
    valor,
    moeda,
    method,
    vencimento: vencimentoRaw ? new Date(vencimentoRaw) : null,
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: r.motivo === "MOEDA_DIVERGENTE" ? "A moeda informada é diferente da moeda da proposta desta reserva." : "Reserva não encontrada." };
  return { ok: true };
}

export async function registrarResultadoPaymentAction(leadId: string, paymentId: string, novoStatus: Extract<PaymentStatus, "PROCESSANDO" | "PAGO" | "PARCIALMENTE_PAGO" | "FALHOU" | "CANCELADO">): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "payments.manage");

  const r = await registrarResultadoPayment(prisma, { tenantId: ctx.tenantId!, paymentId, novoStatus, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: r.motivo === "TRANSICAO_INVALIDA" ? "Essa transição de status não é permitida." : "Pagamento não encontrado." };
  return { ok: true };
}

export async function solicitarEstornoAction(leadId: string, paymentId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "payments.refund");

  const valorEstorno = Number(String(formData.get("valorEstorno") ?? "").trim());
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!(valorEstorno > 0)) return { error: "Informe um valor de estorno válido." };
  if (!motivo) return { error: "Informe o motivo do estorno." };

  const r = await solicitarEstornoPayment(prisma, { tenantId: ctx.tenantId!, paymentId, valorEstorno, motivo, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) {
    const mensagens: Record<string, string> = {
      NAO_ENCONTRADO: "Pagamento não encontrado.",
      STATUS_NAO_PERMITE_ESTORNO: "Só é possível estornar um pagamento confirmado (pago ou parcialmente pago).",
      VALOR_INVALIDO: "Valor de estorno inválido (maior que zero e até o valor pago).",
    };
    return { error: mensagens[r.motivo] ?? "Não foi possível solicitar o estorno." };
  }
  return { ok: true };
}

export async function verificarEstornoAction(leadId: string, paymentId: string): Promise<{ ok?: boolean; error?: string; status?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "payments.refund");

  const r = await confirmarEstornoAposAprovacaoGate(prisma, { tenantId: ctx.tenantId!, paymentId });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: "Pagamento ou Gate não encontrado." };
  return { ok: true, status: r.status };
}
