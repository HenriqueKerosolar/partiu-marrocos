import type { PrismaClient, Trip, TripStatus, TripItineraryDay, TripActivity, TripChecklistItem, TripChecklistCategoria, Booking, ActorType, Prisma } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * Trip Operation Foundation 01 (PM-NIGHT-RUN-02, Etapa 5) — distingue
 * BOOKING (reserva/venda do cliente, Booking Foundation 01) de TRIP
 * (execução operacional de uma partida). Relação 1:N deliberada — uma
 * Trip pode reunir vários Bookings da mesma partida; um Booking pode
 * existir sem Trip associada ainda. Nunca presumido 1:1 (§33 do comando).
 *
 * Eventos operacionais (§37) usam o Audit Log já existente (T1) — mesmo
 * princípio de toda a fundação (Booking/Payment/Commission/TravelerDocument
 * nunca inventaram uma tabela de evento própria); nenhuma tabela "TripEvent"
 * nova foi criada.
 *
 * Motor genericamente turístico: nenhum campo aqui é específico de
 * Marrocos — `roteiro`/`mercado` são texto livre preenchido pelo tenant.
 */

// ---------------------------------------------------------------------------
// Trip — CRUD + máquina de estados
// ---------------------------------------------------------------------------

const TRANSICOES_VALIDAS: Record<TripStatus, TripStatus[]> = {
  PLANEJAMENTO: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["EM_ANDAMENTO", "CANCELADA"],
  EM_ANDAMENTO: ["CONCLUIDA"], // mesma decisão de Booking: viagem em andamento não cancela sozinha
  CONCLUIDA: [],
  CANCELADA: [],
};

export function transicaoValidaTrip(de: TripStatus, para: TripStatus): boolean {
  return TRANSICOES_VALIDAS[de]?.includes(para) ?? false;
}

export interface CriarTripParams {
  tenantId: string;
  roteiro?: string | null;
  mercado?: string | null;
  dataInicio: Date;
  dataFim: Date;
  timezone: string;
  responsavelOperacionalId?: string | null;
  observacoes?: string | null;
  metadata?: unknown;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function criarTrip(prisma: PrismaClient, params: CriarTripParams): Promise<Trip> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const trip = await tx.trip.create({
      data: {
        tenantId: params.tenantId,
        roteiro: params.roteiro ?? null,
        mercado: params.mercado ?? null,
        dataInicio: params.dataInicio,
        dataFim: params.dataFim,
        timezone: params.timezone,
        responsavelOperacionalId: params.responsavelOperacionalId ?? null,
        observacoes: params.observacoes ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "TRIP_CRIADA",
      entidade: "Trip",
      entidadeId: trip.id,
      resultado: "ok",
      detalhe: { dataInicio: trip.dataInicio, dataFim: trip.dataFim },
    });
    return trip;
  });
}

export interface MoverStatusTripParams {
  tenantId: string;
  tripId: string;
  novoStatus: TripStatus;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type MoverStatusTripResultado = { ok: true; trip: Trip } | { ok: false; motivo: "NAO_ENCONTRADA" | "TRANSICAO_INVALIDA" };

export async function moverStatusTrip(prisma: PrismaClient, params: MoverStatusTripParams): Promise<MoverStatusTripResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.trip.findUnique({ where: { id: params.tripId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (!transicaoValidaTrip(atual.status, params.novoStatus)) return { ok: false, motivo: "TRANSICAO_INVALIDA" };

    const trip = await tx.trip.update({ where: { id: atual.id }, data: { status: params.novoStatus } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "TRIP_STATUS_ALTERADO",
      entidade: "Trip",
      entidadeId: trip.id,
      resultado: "ok",
      detalhe: { de: atual.status, para: params.novoStatus },
    });
    return { ok: true, trip };
  });
}

// ---------------------------------------------------------------------------
// Vincular/desvincular Booking — nunca 1:1, um Booking troca de Trip
// livremente (ex.: remanejamento de partida), nunca duplica vínculo.
// ---------------------------------------------------------------------------

export type VincularBookingResultado = { ok: true; booking: Booking } | { ok: false; motivo: "BOOKING_NAO_ENCONTRADO" | "TRIP_NAO_ENCONTRADA" };

export async function vincularBookingATrip(
  prisma: PrismaClient,
  params: { tenantId: string; bookingId: string; tripId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<VincularBookingResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const [booking, trip] = await Promise.all([tx.booking.findUnique({ where: { id: params.bookingId } }), tx.trip.findUnique({ where: { id: params.tripId } })]);
    if (!booking) return { ok: false, motivo: "BOOKING_NAO_ENCONTRADO" };
    if (!trip) return { ok: false, motivo: "TRIP_NAO_ENCONTRADA" };

    const atualizado = await tx.booking.update({ where: { id: booking.id }, data: { tripId: trip.id } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "BOOKING_VINCULADO_TRIP",
      entidade: "Booking",
      entidadeId: booking.id,
      resultado: "ok",
      detalhe: { tripId: trip.id, tripIdAnterior: booking.tripId },
    });
    return { ok: true, booking: atualizado };
  });
}

export async function desvincularBookingDaTrip(prisma: PrismaClient, params: { tenantId: string; bookingId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null }): Promise<boolean> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: params.bookingId } });
    if (!booking || !booking.tripId) return false;

    await tx.booking.update({ where: { id: booking.id }, data: { tripId: null } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "BOOKING_DESVINCULADO_TRIP",
      entidade: "Booking",
      entidadeId: booking.id,
      resultado: "ok",
      detalhe: { tripIdAnterior: booking.tripId },
    });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Itinerário — Day + Activity
// ---------------------------------------------------------------------------

export interface CriarDiaItinerarioParams {
  tenantId: string;
  tripId: string;
  numeroDia: number;
  data: Date;
  titulo?: string | null;
  observacoes?: string | null;
}

export type CriarDiaResultado = { ok: true; dia: TripItineraryDay } | { ok: false; motivo: "TRIP_NAO_ENCONTRADA" | "DIA_JA_EXISTE" };

export async function criarDiaItinerario(prisma: PrismaClient, params: CriarDiaItinerarioParams): Promise<CriarDiaResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const trip = await tx.trip.findUnique({ where: { id: params.tripId } });
    if (!trip) return { ok: false, motivo: "TRIP_NAO_ENCONTRADA" };

    const existente = await tx.tripItineraryDay.findUnique({ where: { tenantId_tripId_numeroDia: { tenantId: params.tenantId, tripId: params.tripId, numeroDia: params.numeroDia } } });
    if (existente) return { ok: false, motivo: "DIA_JA_EXISTE" };

    const dia = await tx.tripItineraryDay.create({
      data: { tenantId: params.tenantId, tripId: trip.id, numeroDia: params.numeroDia, data: params.data, titulo: params.titulo ?? null, observacoes: params.observacoes ?? null },
    });
    return { ok: true, dia };
  });
}

export interface CriarAtividadeParams {
  tenantId: string;
  itineraryDayId: string;
  nome: string;
  descricao?: string | null;
  local?: string | null;
  horaInicio?: string | null;
  horaFim?: string | null;
  instrucoes?: string | null;
  visivelParaViajante?: boolean;
  fornecedorReferencia?: string | null;
}

export type CriarAtividadeResultado = { ok: true; atividade: TripActivity } | { ok: false; motivo: "DIA_NAO_ENCONTRADO" };

export async function criarAtividade(prisma: PrismaClient, params: CriarAtividadeParams): Promise<CriarAtividadeResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const dia = await tx.tripItineraryDay.findUnique({ where: { id: params.itineraryDayId } });
    if (!dia) return { ok: false, motivo: "DIA_NAO_ENCONTRADO" };

    const atividade = await tx.tripActivity.create({
      data: {
        tenantId: params.tenantId,
        itineraryDayId: dia.id,
        nome: params.nome,
        descricao: params.descricao ?? null,
        local: params.local ?? null,
        horaInicio: params.horaInicio ?? null,
        horaFim: params.horaFim ?? null,
        instrucoes: params.instrucoes ?? null,
        visivelParaViajante: params.visivelParaViajante ?? true,
        fornecedorReferencia: params.fornecedorReferencia ?? null,
      },
    });
    return { ok: true, atividade };
  });
}

export async function listarItinerario(prisma: PrismaClient, tenantId: string, tripId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.tripItineraryDay.findMany({ where: { tenantId, tripId }, include: { atividades: { orderBy: { horaInicio: "asc" } } }, orderBy: { numeroDia: "asc" } }),
  );
}

// ---------------------------------------------------------------------------
// Checklist operacional (§36) — item simples concluído/pendente.
// ---------------------------------------------------------------------------

export async function criarItemChecklist(
  prisma: PrismaClient,
  params: { tenantId: string; tripId: string; categoria: TripChecklistCategoria; titulo: string; observacoes?: string | null },
): Promise<{ ok: true; item: TripChecklistItem } | { ok: false; motivo: "TRIP_NAO_ENCONTRADA" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const trip = await tx.trip.findUnique({ where: { id: params.tripId } });
    if (!trip) return { ok: false, motivo: "TRIP_NAO_ENCONTRADA" };

    const item = await tx.tripChecklistItem.create({
      data: { tenantId: params.tenantId, tripId: trip.id, categoria: params.categoria, titulo: params.titulo, observacoes: params.observacoes ?? null },
    });
    return { ok: true, item };
  });
}

export async function alternarItemChecklist(prisma: PrismaClient, params: { tenantId: string; itemId: string; concluido: boolean }): Promise<boolean> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const result = await tx.tripChecklistItem.updateMany({ where: { id: params.itemId, tenantId: params.tenantId }, data: { concluido: params.concluido } });
    return result.count > 0;
  });
}

export async function listarChecklist(prisma: PrismaClient, tenantId: string, tripId: string): Promise<TripChecklistItem[]> {
  return withTenant(prisma, tenantId, (tx) => tx.tripChecklistItem.findMany({ where: { tenantId, tripId }, orderBy: [{ categoria: "asc" }, { createdAt: "asc" }] }));
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export async function listarTripsDoTenant(prisma: PrismaClient, tenantId: string) {
  return withTenant(prisma, tenantId, (tx) => tx.trip.findMany({ where: { tenantId }, include: { bookings: true }, orderBy: { dataInicio: "asc" } }));
}

export async function buscarTrip(prisma: PrismaClient, tenantId: string, tripId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.trip.findUnique({
      where: { id: tripId },
      include: { bookings: { include: { proposal: true, travelers: true } }, responsavelOperacional: true },
    }),
  );
}

export async function listarTripsDisponiveisParaBooking(prisma: PrismaClient, tenantId: string) {
  return withTenant(prisma, tenantId, (tx) => tx.trip.findMany({ where: { tenantId, status: { in: ["PLANEJAMENTO", "CONFIRMADA"] } }, orderBy: { dataInicio: "asc" } }));
}
