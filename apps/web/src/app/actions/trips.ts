"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  criarTrip,
  moverStatusTrip,
  vincularBookingATrip,
  desvincularBookingDaTrip,
  criarDiaItinerario,
  criarAtividade,
  criarItemChecklist,
  alternarItemChecklist,
  type TripStatus,
  type TripChecklistCategoria,
} from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

export async function criarTripAction(formData: FormData): Promise<{ ok?: boolean; error?: string; tripId?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "trips.manage");

  const dataInicioRaw = String(formData.get("dataInicio") ?? "").trim();
  const dataFimRaw = String(formData.get("dataFim") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!dataInicioRaw || !dataFimRaw || !timezone) return { error: "Informe data de início, data de fim e timezone." };

  const trip = await criarTrip(prisma, {
    tenantId: ctx.tenantId!,
    roteiro: String(formData.get("roteiro") ?? "").trim() || null,
    mercado: String(formData.get("mercado") ?? "").trim() || null,
    dataInicio: new Date(dataInicioRaw),
    dataFim: new Date(dataFimRaw),
    timezone,
    observacoes: String(formData.get("observacoes") ?? "").trim() || null,
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath("/viagens");
  return { ok: true, tripId: trip.id };
}

export async function moverStatusTripAction(tripId: string, novoStatus: TripStatus): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "trips.manage");

  const r = await moverStatusTrip(prisma, { tenantId: ctx.tenantId!, tripId, novoStatus, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/viagens/${tripId}`);
  if (!r.ok) return { error: r.motivo === "TRANSICAO_INVALIDA" ? "Essa transição de status não é permitida." : "Viagem não encontrada." };
  return { ok: true };
}

export async function vincularBookingATripAction(leadId: string, bookingId: string, tripId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "trips.manage");

  const r = await vincularBookingATrip(prisma, { tenantId: ctx.tenantId!, bookingId, tripId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/viagens/${tripId}`);
  return r.ok ? { ok: true } : { error: "Não foi possível vincular a reserva." };
}

export async function desvincularBookingDaTripAction(leadId: string, bookingId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "trips.manage");

  const ok = await desvincularBookingDaTrip(prisma, { tenantId: ctx.tenantId!, bookingId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/leads/${leadId}`);
  return ok ? { ok: true } : { error: "Reserva não tinha viagem vinculada." };
}

export async function criarDiaItinerarioAction(tripId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "trips.manage");

  const numeroDia = Number(String(formData.get("numeroDia") ?? "").trim());
  const dataRaw = String(formData.get("data") ?? "").trim();
  if (!(numeroDia > 0) || !dataRaw) return { error: "Informe o número do dia e a data." };

  const r = await criarDiaItinerario(prisma, {
    tenantId: ctx.tenantId!,
    tripId,
    numeroDia,
    data: new Date(dataRaw),
    titulo: String(formData.get("titulo") ?? "").trim() || null,
  });
  revalidatePath(`/viagens/${tripId}`);
  if (!r.ok) return { error: r.motivo === "DIA_JA_EXISTE" ? "Já existe um dia com esse número." : "Viagem não encontrada." };
  return { ok: true };
}

export async function criarAtividadeAction(tripId: string, itineraryDayId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "trips.manage");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe o nome da atividade." };

  const r = await criarAtividade(prisma, {
    tenantId: ctx.tenantId!,
    itineraryDayId,
    nome,
    local: String(formData.get("local") ?? "").trim() || null,
    horaInicio: String(formData.get("horaInicio") ?? "").trim() || null,
    visivelParaViajante: formData.get("visivelParaViajante") === "on",
  });
  revalidatePath(`/viagens/${tripId}`);
  if (!r.ok) return { error: "Dia do itinerário não encontrado." };
  return { ok: true };
}

export async function criarItemChecklistAction(tripId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "trips.manage");

  const titulo = String(formData.get("titulo") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "OUTRO") as TripChecklistCategoria;
  if (!titulo) return { error: "Informe o título do item." };

  const r = await criarItemChecklist(prisma, { tenantId: ctx.tenantId!, tripId, categoria, titulo });
  revalidatePath(`/viagens/${tripId}`);
  if (!r.ok) return { error: "Viagem não encontrada." };
  return { ok: true };
}

export async function alternarItemChecklistAction(tripId: string, itemId: string, concluido: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "trips.manage");

  const ok = await alternarItemChecklist(prisma, { tenantId: ctx.tenantId!, itemId, concluido });
  revalidatePath(`/viagens/${tripId}`);
  return ok ? { ok: true } : { error: "Item não encontrado." };
}
