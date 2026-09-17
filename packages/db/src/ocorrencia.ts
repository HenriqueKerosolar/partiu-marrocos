import type { PrismaClient, TripIncident, TripIncidentSeveridade, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-05, Track B — ocorrência operacional registrada pelo guia/
 * motorista em campo. Distinto de Ouvidoria/SupportTicket (aquilo é
 * cliente-facing; isto é interno, sempre ligado a um TripGroup, nunca a um
 * Lead). Append-only por design — sem função de editar/apagar.
 */

export interface RegistrarOcorrenciaParams {
  tenantId: string;
  tripGroupId: string;
  professionalId: string;
  severidade?: TripIncidentSeveridade;
  descricao: string;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type RegistrarOcorrenciaResultado =
  | { ok: true; ocorrencia: TripIncident }
  | { ok: false; motivo: "GRUPO_NAO_ENCONTRADO" | "PROFISSIONAL_NAO_ATRIBUIDO_AO_GRUPO" | "DESCRICAO_VAZIA" };

export async function registrarOcorrencia(prisma: PrismaClient, params: RegistrarOcorrenciaParams): Promise<RegistrarOcorrenciaResultado> {
  const descricao = params.descricao.trim();
  if (!descricao) return { ok: false, motivo: "DESCRICAO_VAZIA" };

  return withTenant(prisma, params.tenantId, async (tx) => {
    const grupo = await tx.tripGroup.findUnique({ where: { id: params.tripGroupId } });
    if (!grupo) return { ok: false, motivo: "GRUPO_NAO_ENCONTRADO" };

    const atribuicao = await tx.tripGroupProfissional.findFirst({ where: { tenantId: params.tenantId, tripGroupId: grupo.id, professionalId: params.professionalId } });
    if (!atribuicao) return { ok: false, motivo: "PROFISSIONAL_NAO_ATRIBUIDO_AO_GRUPO" };

    const ocorrencia = await tx.tripIncident.create({
      data: { tenantId: params.tenantId, tripGroupId: grupo.id, professionalId: params.professionalId, severidade: params.severidade ?? "MEDIA", descricao },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "OCORRENCIA_REGISTRADA",
      entidade: "TripIncident",
      entidadeId: ocorrencia.id,
      resultado: "ok",
      detalhe: { tripGroupId: grupo.id, severidade: ocorrencia.severidade },
    });
    return { ok: true, ocorrencia };
  });
}

export async function listarOcorrenciasDoGrupo(prisma: PrismaClient, tenantId: string, tripGroupId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.tripIncident.findMany({ where: { tenantId, tripGroupId }, include: { professional: true }, orderBy: { createdAt: "desc" } }),
  );
}
