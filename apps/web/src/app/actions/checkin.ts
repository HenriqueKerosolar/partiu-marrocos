"use server";

import { revalidatePath } from "next/cache";
import { prisma, withTenant, emitirCredencial, validarCredencial, confirmarCheckIn, confirmarEmbarque, marcarNoShow } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

const MOTIVOS: Record<string, string> = {
  GRUPO_NAO_ENCONTRADO: "Grupo não encontrado.",
  PASSAGEIRO_NAO_PERTENCE_AO_GRUPO: "Este passageiro não pertence a este grupo.",
  CREDENCIAL_REVOGADA: "A credencial anterior foi revogada.",
  JA_EMBARCADO: "Este passageiro já embarcou.",
  FORMATO_INVALIDO: "Código inválido — confira e tente novamente.",
  NAO_ENCONTRADA: "Credencial não encontrada.",
  EXPIRADA: "Credencial expirada.",
  REVOGADA: "Credencial revogada.",
  NO_SHOW_OU_CANCELADO: "Este passageiro está marcado como não compareceu/cancelado.",
  CHECKIN_NAO_REALIZADO: "É preciso confirmar o check-in antes do embarque.",
  CAPACIDADE_EXCEDIDA: "O veículo deste grupo já está com a capacidade máxima ocupada.",
  TRANSICAO_INVALIDA: "Não é possível marcar não comparecimento neste estado.",
};

export async function emitirCredencialAction(tripId: string, tripGroupId: string, travelerId: string): Promise<{ ok?: boolean; error?: string; token?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "checkin.execute");
  const r = await emitirCredencial(prisma, { tenantId: ctx.tenantId!, tripGroupId, travelerId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/viagens/${tripId}`);
  if (!r.ok) return { error: MOTIVOS[r.motivo] ?? "Não foi possível emitir a credencial." };
  return { ok: true, token: r.token };
}

export interface CredencialInfo {
  travelerId: string;
  travelerNome: string;
  status: string;
  tripGroupNome: string;
}

export async function validarCredencialAction(token: string): Promise<{ ok?: boolean; error?: string; info?: CredencialInfo }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "checkin.view");
  const r = await validarCredencial(prisma, ctx.tenantId!, token);
  if (!r.ok) return { error: MOTIVOS[r.motivo] ?? "Credencial inválida." };

  // Leitura auxiliar (nome do passageiro/grupo pra exibir) SEMPRE dentro de
  // withTenant — sem isso, RLS fail-closed faria essas consultas retornarem
  // nulo mesmo com a credencial válida (achado ao revisar este código).
  const { travelerId, tripGroupId, status } = r.travelerCheckIn;
  const { travelerNome, tripGroupNome } = await withTenant(prisma, ctx.tenantId!, async (tx) => {
    const traveler = await tx.traveler.findUnique({ where: { id: travelerId }, select: { nome: true } });
    const grupo = await tx.tripGroup.findUnique({ where: { id: tripGroupId }, select: { nome: true } });
    return { travelerNome: traveler?.nome ?? "—", tripGroupNome: grupo?.nome ?? "—" };
  });

  return { ok: true, info: { travelerId, travelerNome, status, tripGroupNome } };
}

export async function confirmarCheckInAction(token: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "checkin.execute");
  const r = await confirmarCheckIn(prisma, { tenantId: ctx.tenantId!, tokenBruto: token, actorType: "HUMANO", userId: ctx.user.id });
  if (!r.ok) return { error: MOTIVOS[r.motivo] ?? "Não foi possível confirmar o check-in." };
  return { ok: true };
}

export async function confirmarEmbarqueAction(token: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "boarding.execute");
  const r = await confirmarEmbarque(prisma, { tenantId: ctx.tenantId!, tokenBruto: token, actorType: "HUMANO", userId: ctx.user.id });
  if (!r.ok) return { error: MOTIVOS[r.motivo] ?? "Não foi possível confirmar o embarque." };
  return { ok: true };
}

export async function marcarNoShowAction(travelerCheckInId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "boarding.execute");
  const r = await marcarNoShow(prisma, { tenantId: ctx.tenantId!, travelerCheckInId, actorType: "HUMANO", userId: ctx.user.id });
  return r.ok ? { ok: true } : { error: MOTIVOS[r.motivo] ?? "Não foi possível registrar." };
}
