"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  iniciarTracking,
  finalizarTracking,
  registrarPing,
  obterPosicoesAtivasDoGrupo,
  buscarSessaoAtivaDoProfissional,
  buscarProfessionalDoUsuario,
  listarGruposDoProfissional,
  type PosicaoAtual,
} from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission, hasPermission } from "@/lib/rbac";
import { garantirPurgaDePingsAgendada } from "@/lib/jobs";

const MOTIVOS: Record<string, string> = {
  GRUPO_NAO_ENCONTRADO: "Grupo não encontrado.",
  PROFISSIONAL_NAO_ENCONTRADO: "Profissional não encontrado.",
  PROFISSIONAL_NAO_ATRIBUIDO_AO_GRUPO: "Você não está atribuído a este grupo operacional.",
  SESSAO_NAO_ENCONTRADA: "Sessão de rastreamento não encontrada.",
  SESSAO_FINALIZADA: "O rastreamento desta sessão já foi encerrado.",
  COORDENADA_INVALIDA: "Coordenada inválida.",
  NAO_ENCONTRADA: "Sessão não encontrada.",
};

/** Mapa (view-only) — usado pela Central de Operações e pelo detalhe da viagem. */
export async function obterPosicoesAtivasAction(tripGroupId: string): Promise<PosicaoAtual[]> {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "gps.view")) return [];
  return obterPosicoesAtivasDoGrupo(prisma, ctx.tenantId!, tripGroupId);
}

/** Grupos operacionais em que o profissional logado está atribuído — pra escolher onde iniciar o rastreamento. */
export async function listarMeusGruposAction(): Promise<{ id: string; nome: string; tripRoteiro: string | null }[]> {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "gps.track")) return [];
  const profissional = await buscarProfessionalDoUsuario(prisma, ctx.tenantId!, ctx.user.id);
  if (!profissional) return [];
  const grupos = await listarGruposDoProfissional(prisma, ctx.tenantId!, profissional.id);
  return grupos.map((g) => ({ id: g.id, nome: g.nome, tripRoteiro: g.trip.roteiro }));
}

/** O profissional logado (via Professional.userId) inicia o próprio rastreamento — app mobile de guia/motorista. */
export async function iniciarMeuTrackingAction(tripGroupId: string): Promise<{ ok?: boolean; error?: string; trackingSessionId?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "gps.track");
  const profissional = await buscarProfessionalDoUsuario(prisma, ctx.tenantId!, ctx.user.id);
  if (!profissional) return { error: "Seu usuário não está vinculado a um profissional de operação." };

  const r = await iniciarTracking(prisma, { tenantId: ctx.tenantId!, tripGroupId, professionalId: profissional.id, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath("/checkin");
  if (!r.ok) return { error: MOTIVOS[r.motivo] ?? "Não foi possível iniciar o rastreamento." };

  // PM-CONV-06 §4E — garante que a purga periódica de pings antigos (T5) já
  // está agendada para este tenant. Idempotente (idempotencyKey por dia),
  // então não gera duplicidade mesmo chamando toda vez que um tracking inicia.
  await garantirPurgaDePingsAgendada(prisma, ctx.tenantId!);

  return { ok: true, trackingSessionId: r.trackingSession.id };
}

export async function finalizarMeuTrackingAction(trackingSessionId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "gps.track");
  const r = await finalizarTracking(prisma, { tenantId: ctx.tenantId!, trackingSessionId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath("/checkin");
  if (!r.ok) return { error: MOTIVOS[r.motivo] ?? "Não foi possível finalizar o rastreamento." };
  return { ok: true };
}

/** Sessão ATIVA do profissional logado, se houver — pra saber se o botão deve mostrar "iniciar" ou "finalizar". */
export async function buscarMinhaSessaoAtivaAction(): Promise<{ trackingSessionId: string; tripGroupId: string } | null> {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "gps.track")) return null;
  const profissional = await buscarProfessionalDoUsuario(prisma, ctx.tenantId!, ctx.user.id);
  if (!profissional) return null;
  const sessao = await buscarSessaoAtivaDoProfissional(prisma, ctx.tenantId!, profissional.id);
  return sessao ? { trackingSessionId: sessao.id, tripGroupId: sessao.tripGroupId } : null;
}

/**
 * Ping de localização — chamado pelo navegador do celular do profissional
 * via `navigator.geolocation.watchPosition`. `capturedAtIso` vem do
 * dispositivo (timestamp real do evento, não "agora do servidor").
 */
export async function registrarPingAction(params: { trackingSessionId: string; latitude: number; longitude: number; accuracy?: number; capturedAtIso: string }): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "gps.track");
  const r = await registrarPing(prisma, {
    tenantId: ctx.tenantId!,
    trackingSessionId: params.trackingSessionId,
    latitude: params.latitude,
    longitude: params.longitude,
    accuracy: params.accuracy ?? null,
    source: "GPS",
    capturedAt: new Date(params.capturedAtIso),
  });
  if (!r.ok) return { error: MOTIVOS[r.motivo] ?? "Não foi possível registrar a posição." };
  return { ok: true };
}
