"use server";

import { revalidatePath } from "next/cache";
import { prisma, criarBookingDaProposta, moverBookingStatus, adicionarTraveler, removerTraveler, type BookingStatus, type TravelerTipo } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

export async function criarBookingAction(leadId: string, propostaId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "bookings.manage");

  const r = await criarBookingDaProposta(prisma, { tenantId: ctx.tenantId!, propostaId, responsavelId: ctx.user.id, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: r.motivo === "PROPOSTA_NAO_ACEITA" ? "Só é possível criar uma reserva a partir de uma proposta aceita." : "Proposta não encontrada." };
  return { ok: true };
}

export async function moverBookingStatusAction(leadId: string, bookingId: string, novoStatus: BookingStatus): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "bookings.manage");

  const r = await moverBookingStatus(prisma, { tenantId: ctx.tenantId!, bookingId, novoStatus, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: r.motivo === "TRANSICAO_INVALIDA" ? "Essa transição de status não é permitida." : "Reserva não encontrada." };
  return { ok: true };
}

export async function adicionarTravelerAction(leadId: string, bookingId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "bookings.manage");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe o nome do passageiro." };
  const tipo = String(formData.get("tipo") ?? "ADULTO") as TravelerTipo;
  const dataNascimentoRaw = String(formData.get("dataNascimento") ?? "").trim();

  const r = await adicionarTraveler(prisma, {
    tenantId: ctx.tenantId!,
    bookingId,
    nome,
    tipo,
    dataNascimento: dataNascimentoRaw ? new Date(dataNascimentoRaw) : null,
    nacionalidade: String(formData.get("nacionalidade") ?? "").trim() || null,
  });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: "Reserva não encontrada." };
  return { ok: true };
}

export async function removerTravelerAction(leadId: string, travelerId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "bookings.manage");

  const removido = await removerTraveler(prisma, { tenantId: ctx.tenantId!, travelerId });
  revalidatePath(`/leads/${leadId}`);
  return removido ? { ok: true } : { error: "Passageiro não encontrado." };
}
