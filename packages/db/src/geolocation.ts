import type { PrismaClient, TrackingSession, GeolocationPing, GeolocationSource, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-05, Track A — GPS / Mapas / Live Location.
 *
 * Regra central (§ do comando, ecoando a decisão já registrada em
 * schema.prisma desde PM-CONV-03/04 de deixar GPS de fora até ser
 * autorizado): só existe ping de localização dentro de uma TrackingSession
 * ATIVA, aberta explicitamente por quem está em campo. Nunca "rastrear
 * sempre" — início e fim são sempre uma ação humana explícita.
 *
 * Coordenadas são validadas em DOIS lugares (defesa em profundidade, mesmo
 * padrão da CHECK constraint XOR de Commission): aqui, antes do insert, e
 * de novo no banco via CHECK constraint — mesmo uma query manual malfeita
 * não consegue gravar uma coordenada fora do intervalo válido.
 */

function coordenadaValida(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

// ---------------------------------------------------------------------------
// Sessão de tracking — início/fim explícito (§ "não rastrear fora de
// operação ativa")
// ---------------------------------------------------------------------------

export interface IniciarTrackingParams {
  tenantId: string;
  tripGroupId: string;
  professionalId: string;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type IniciarTrackingResultado =
  | { ok: true; trackingSession: TrackingSession; jaAtiva: boolean }
  | { ok: false; motivo: "GRUPO_NAO_ENCONTRADO" | "PROFISSIONAL_NAO_ENCONTRADO" | "PROFISSIONAL_NAO_ATRIBUIDO_AO_GRUPO" };

export async function iniciarTracking(prisma: PrismaClient, params: IniciarTrackingParams): Promise<IniciarTrackingResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const grupo = await tx.tripGroup.findUnique({ where: { id: params.tripGroupId } });
    if (!grupo) return { ok: false, motivo: "GRUPO_NAO_ENCONTRADO" };

    const profissional = await tx.professional.findUnique({ where: { id: params.professionalId } });
    if (!profissional) return { ok: false, motivo: "PROFISSIONAL_NAO_ENCONTRADO" };

    const atribuicao = await tx.tripGroupProfissional.findFirst({ where: { tenantId: params.tenantId, tripGroupId: grupo.id, professionalId: profissional.id } });
    if (!atribuicao) return { ok: false, motivo: "PROFISSIONAL_NAO_ATRIBUIDO_AO_GRUPO" };

    // Reserva atômica (INSERT...ON CONFLICT...DO NOTHING...RETURNING —
    // mesmo padrão já comprovado em cost-control.ts/tools/broker.ts) e NÃO
    // "SELECT se já existe, senão create()": sob concorrência real (dois
    // starts simultâneos pro mesmo grupo+profissional), ambas as
    // transações podem passar pelo SELECT antes de qualquer uma commitar
    // (READ COMMITTED) — um `create()` desprotegido aí lançaria um erro de
    // violação do índice único parcial (`tracking_sessions_ativa_unica`)
    // não tratado, e pior: um erro de constraint dentro de uma transação
    // interativa do Prisma "envenena" a transação Postgres inteira (25P02),
    // quebrando também o `registrarEvento` que viria depois. A query ON
    // CONFLICT precisa repetir a MESMA condição WHERE do índice parcial
    // (`status = 'ATIVA'`) como alvo do conflito.
    const iniciadoPorId = params.actorType === "HUMANO" ? (params.userId ?? null) : null;
    const inserida = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO tracking_sessions (id, tenant_id, trip_group_id, professional_id, status, iniciado_em, iniciado_por_id)
      VALUES (gen_random_uuid()::text, ${params.tenantId}, ${grupo.id}, ${profissional.id}, 'ATIVA'::"TrackingSessionStatus", now(), ${iniciadoPorId})
      ON CONFLICT (tenant_id, trip_group_id, professional_id) WHERE status = 'ATIVA' DO NOTHING
      RETURNING id
    `;

    if (inserida.length === 0) {
      // Perdeu a corrida (ou já estava ativa antes mesmo de tentar) — a
      // sessão ATIVA existente é o resultado correto, idempotente.
      const existente = await tx.trackingSession.findFirstOrThrow({
        where: { tenantId: params.tenantId, tripGroupId: grupo.id, professionalId: profissional.id, status: "ATIVA" },
      });
      return { ok: true, trackingSession: existente, jaAtiva: true };
    }

    const trackingSession = await tx.trackingSession.findUniqueOrThrow({ where: { id: inserida[0]!.id } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "TRACKING_SESSION_INICIADA",
      entidade: "TrackingSession",
      entidadeId: trackingSession.id,
      resultado: "ok",
      detalhe: { tripGroupId: grupo.id, professionalId: profissional.id },
    });
    return { ok: true, trackingSession, jaAtiva: false };
  });
}

export type FinalizarTrackingResultado =
  | { ok: true; trackingSession: TrackingSession; jaAplicado: boolean }
  | { ok: false; motivo: "NAO_ENCONTRADA" };

export async function finalizarTracking(
  prisma: PrismaClient,
  params: { tenantId: string; trackingSessionId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<FinalizarTrackingResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.trackingSession.findUnique({ where: { id: params.trackingSessionId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (atual.status === "FINALIZADA") return { ok: true, trackingSession: atual, jaAplicado: true };

    const trackingSession = await tx.trackingSession.update({
      where: { id: atual.id },
      data: { status: "FINALIZADA", finalizadoEm: new Date(), finalizadoPorId: params.actorType === "HUMANO" ? (params.userId ?? null) : null },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "TRACKING_SESSION_FINALIZADA",
      entidade: "TrackingSession",
      entidadeId: trackingSession.id,
      resultado: "ok",
      detalhe: { tripGroupId: trackingSession.tripGroupId, professionalId: trackingSession.professionalId },
    });
    return { ok: true, trackingSession, jaAplicado: false };
  });
}

// ---------------------------------------------------------------------------
// Ping de localização — nunca fora de uma sessão ATIVA (§ "tracking
// somente em operação ativa"). Sem Audit por ping — volume alto de
// eventos por natureza (um a cada poucos segundos); o início/fim da sessão
// já é o evento auditável relevante.
// ---------------------------------------------------------------------------

export interface RegistrarPingParams {
  tenantId: string;
  trackingSessionId: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source?: GeolocationSource;
  capturedAt: Date;
}

export type RegistrarPingResultado =
  | { ok: true; ping: GeolocationPing }
  | { ok: false; motivo: "SESSAO_NAO_ENCONTRADA" | "SESSAO_FINALIZADA" | "COORDENADA_INVALIDA" };

export async function registrarPing(prisma: PrismaClient, params: RegistrarPingParams): Promise<RegistrarPingResultado> {
  if (!coordenadaValida(params.latitude, params.longitude)) return { ok: false, motivo: "COORDENADA_INVALIDA" };

  return withTenant(prisma, params.tenantId, async (tx) => {
    const sessao = await tx.trackingSession.findUnique({ where: { id: params.trackingSessionId } });
    if (!sessao) return { ok: false, motivo: "SESSAO_NAO_ENCONTRADA" };
    if (sessao.status !== "ATIVA") return { ok: false, motivo: "SESSAO_FINALIZADA" };

    const ping = await tx.geolocationPing.create({
      data: {
        tenantId: params.tenantId,
        trackingSessionId: sessao.id,
        latitude: params.latitude,
        longitude: params.longitude,
        accuracy: params.accuracy ?? null,
        source: params.source ?? "GPS",
        capturedAt: params.capturedAt,
      },
    });
    return { ok: true, ping };
  });
}

// ---------------------------------------------------------------------------
// Consultas — mapa operacional
// ---------------------------------------------------------------------------

export interface PosicaoAtual {
  trackingSessionId: string;
  professionalId: string;
  professionalNome: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: Date;
}

/** Última posição conhecida de cada sessão ATIVA de um grupo — o que o mapa desenha. */
export async function obterPosicoesAtivasDoGrupo(prisma: PrismaClient, tenantId: string, tripGroupId: string): Promise<PosicaoAtual[]> {
  return withTenant(prisma, tenantId, async (tx) => {
    const sessoes = await tx.trackingSession.findMany({
      where: { tenantId, tripGroupId, status: "ATIVA" },
      include: { professional: true, pings: { orderBy: { capturedAt: "desc" }, take: 1 } },
    });
    return sessoes
      .filter((s) => s.pings.length > 0)
      .map((s) => {
        const ping = s.pings[0]!;
        return {
          trackingSessionId: s.id,
          professionalId: s.professionalId,
          professionalNome: s.professional.nome,
          latitude: ping.latitude,
          longitude: ping.longitude,
          accuracy: ping.accuracy,
          capturedAt: ping.capturedAt,
        };
      });
  });
}

export async function listarSessoesDoGrupo(prisma: PrismaClient, tenantId: string, tripGroupId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.trackingSession.findMany({ where: { tenantId, tripGroupId }, include: { professional: true }, orderBy: { iniciadoEm: "desc" } }),
  );
}

/** Sessão ATIVA do próprio profissional logado, se houver — usado pelo app mobile pra saber se já está rastreando. */
export async function buscarSessaoAtivaDoProfissional(prisma: PrismaClient, tenantId: string, professionalId: string) {
  return withTenant(prisma, tenantId, (tx) => tx.trackingSession.findFirst({ where: { tenantId, professionalId, status: "ATIVA" } }));
}

// ---------------------------------------------------------------------------
// Retenção — pings são dado de alto volume e vida curta; só o histórico de
// SESSÕES (início/fim, auditado) precisa durar indefinidamente. Nunca purga
// pings de sessão ainda ATIVA.
// ---------------------------------------------------------------------------

export const RETENCAO_PINGS_DIAS_PADRAO = 90;

export async function purgarPingsAntigos(prisma: PrismaClient, tenantId: string, diasRetencao = RETENCAO_PINGS_DIAS_PADRAO): Promise<number> {
  const limite = new Date(Date.now() - diasRetencao * 24 * 60 * 60 * 1000);
  return withTenant(prisma, tenantId, async (tx) => {
    const resultado = await tx.geolocationPing.deleteMany({
      where: { tenantId, capturedAt: { lt: limite }, trackingSession: { status: "FINALIZADA" } },
    });
    return resultado.count;
  });
}
