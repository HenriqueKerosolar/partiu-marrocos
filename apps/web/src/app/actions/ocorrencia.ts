"use server";

import { revalidatePath } from "next/cache";
import { prisma, registrarOcorrencia, listarOcorrenciasDoGrupo, buscarProfessionalDoUsuario, type TripIncidentSeveridade } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission, hasPermission } from "@/lib/rbac";

const MOTIVOS: Record<string, string> = {
  GRUPO_NAO_ENCONTRADO: "Grupo não encontrado.",
  PROFISSIONAL_NAO_ATRIBUIDO_AO_GRUPO: "Você não está atribuído a este grupo operacional.",
  DESCRICAO_VAZIA: "Descreva o que aconteceu.",
};

export async function registrarOcorrenciaAction(tripGroupId: string, descricao: string, severidade: TripIncidentSeveridade): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "ocorrencias.registrar");
  const profissional = await buscarProfessionalDoUsuario(prisma, ctx.tenantId!, ctx.user.id);
  if (!profissional) return { error: "Seu usuário não está vinculado a um profissional de operação." };

  const r = await registrarOcorrencia(prisma, { tenantId: ctx.tenantId!, tripGroupId, professionalId: profissional.id, descricao, severidade, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath("/checkin");
  if (!r.ok) return { error: MOTIVOS[r.motivo] ?? "Não foi possível registrar a ocorrência." };
  return { ok: true };
}

export async function listarOcorrenciasDoGrupoAction(tripGroupId: string): Promise<{ id: string; descricao: string; severidade: string; profissionalNome: string; createdAt: string }[]> {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "ocorrencias.view")) return [];
  const lista = await listarOcorrenciasDoGrupo(prisma, ctx.tenantId!, tripGroupId);
  return lista.map((o) => ({ id: o.id, descricao: o.descricao, severidade: o.severidade, profissionalNome: o.professional.nome, createdAt: o.createdAt.toISOString() }));
}
