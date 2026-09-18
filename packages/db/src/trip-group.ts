import type { PrismaClient, TripGroup, TripActivityProgress, TripActivityProgressStatus, ProfessionalPapel, ActorType, Prisma } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-03, §13/§14/§17 — Grupo operacional: subconjunto de Bookings da
 * MESMA Trip, com crew (Professional × papel) e um TourVehicle. Uma Trip
 * pode ter vários Groups (duas vans na mesma partida, por exemplo).
 *
 * Conflito de agenda (§17) é validado aqui, nunca só na UI: o mesmo
 * profissional ou veículo não pode estar em dois Groups cujas Trips tenham
 * datas sobrepostas (mesma regra encontrada na entrega 0.4.11,
 * `Operations.php::saveGroup`, reaproveitada como LÓGICA — não como
 * código — ver PM_CONV_02_INVENTARIO.md, Grupo 2, item 3).
 */

type TenantScopedClient = Prisma.TransactionClient;

async function trioConflitante(
  tx: TenantScopedClient,
  tenantId: string,
  alvo: { dataInicio: Date; dataFim: Date },
  filtro: { veiculoId?: string; professionalId?: string },
  excluirGrupoId?: string,
): Promise<boolean> {
  const grupos = await tx.tripGroup.findMany({
    where: {
      tenantId,
      ...(excluirGrupoId ? { id: { not: excluirGrupoId } } : {}),
      trip: { status: { not: "CANCELADA" } },
    },
    include: { trip: true, profissionais: true },
  });

  return grupos.some((g) => {
    const sobrepoe = g.trip.dataInicio <= alvo.dataFim && g.trip.dataFim >= alvo.dataInicio;
    if (!sobrepoe) return false;
    if (filtro.veiculoId && g.veiculoId === filtro.veiculoId) return true;
    if (filtro.professionalId && g.profissionais.some((p) => p.professionalId === filtro.professionalId)) return true;
    return false;
  });
}

export interface CriarTripGroupParams {
  tenantId: string;
  tripId: string;
  nome: string;
  veiculoId: string;
  observacoes?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type CriarTripGroupResultado =
  | { ok: true; grupo: TripGroup }
  | { ok: false; motivo: "TRIP_NAO_ENCONTRADA" | "TRIP_CANCELADA" | "VEICULO_NAO_ENCONTRADO" | "VEICULO_INATIVO" | "CONFLITO_VEICULO" };

export async function criarTripGroup(prisma: PrismaClient, params: CriarTripGroupParams): Promise<CriarTripGroupResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const trip = await tx.trip.findUnique({ where: { id: params.tripId } });
    if (!trip) return { ok: false, motivo: "TRIP_NAO_ENCONTRADA" };
    if (trip.status === "CANCELADA") return { ok: false, motivo: "TRIP_CANCELADA" };

    const veiculo = await tx.tourVehicle.findUnique({ where: { id: params.veiculoId } });
    if (!veiculo) return { ok: false, motivo: "VEICULO_NAO_ENCONTRADO" };
    if (!veiculo.ativo) return { ok: false, motivo: "VEICULO_INATIVO" };

    if (await trioConflitante(tx, params.tenantId, trip, { veiculoId: veiculo.id })) return { ok: false, motivo: "CONFLITO_VEICULO" };

    const grupo = await tx.tripGroup.create({
      data: { tenantId: params.tenantId, tripId: trip.id, nome: params.nome, veiculoId: veiculo.id, observacoes: params.observacoes ?? null },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "GRUPO_CRIADO",
      entidade: "TripGroup",
      entidadeId: grupo.id,
      resultado: "ok",
      detalhe: { tripId: trip.id, veiculoId: veiculo.id },
    });
    return { ok: true, grupo };
  });
}

export interface AtribuirProfissionalParams {
  tenantId: string;
  tripGroupId: string;
  professionalId: string;
  papel: ProfessionalPapel;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type AtribuirProfissionalResultado =
  | { ok: true; jaAtribuido: boolean }
  | { ok: false; motivo: "GRUPO_NAO_ENCONTRADO" | "PROFISSIONAL_NAO_ENCONTRADO" | "PROFISSIONAL_INATIVO" | "CONFLITO_PROFISSIONAL" };

export async function atribuirProfissional(prisma: PrismaClient, params: AtribuirProfissionalParams): Promise<AtribuirProfissionalResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const grupo = await tx.tripGroup.findUnique({ where: { id: params.tripGroupId }, include: { trip: true } });
    if (!grupo) return { ok: false, motivo: "GRUPO_NAO_ENCONTRADO" };

    const profissional = await tx.professional.findUnique({ where: { id: params.professionalId } });
    if (!profissional) return { ok: false, motivo: "PROFISSIONAL_NAO_ENCONTRADO" };
    if (!profissional.ativo) return { ok: false, motivo: "PROFISSIONAL_INATIVO" };

    const existente = await tx.tripGroupProfissional.findUnique({
      where: { tenantId_tripGroupId_professionalId_papel: { tenantId: params.tenantId, tripGroupId: grupo.id, professionalId: profissional.id, papel: params.papel } },
    });
    // idempotência simples: reatribuir o mesmo (grupo, profissional, papel) nunca duplica nem falha.
    if (existente) return { ok: true, jaAtribuido: true };

    if (await trioConflitante(tx, params.tenantId, grupo.trip, { professionalId: profissional.id }, grupo.id)) return { ok: false, motivo: "CONFLITO_PROFISSIONAL" };

    await tx.tripGroupProfissional.create({ data: { tenantId: params.tenantId, tripGroupId: grupo.id, professionalId: profissional.id, papel: params.papel } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "GRUPO_PROFISSIONAL_ATRIBUIDO",
      entidade: "TripGroup",
      entidadeId: grupo.id,
      resultado: "ok",
      detalhe: { professionalId: profissional.id, papel: params.papel },
    });
    return { ok: true, jaAtribuido: false };
  });
}

export async function removerProfissional(
  prisma: PrismaClient,
  params: { tenantId: string; tripGroupId: string; professionalId: string; papel: ProfessionalPapel; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<boolean> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const result = await tx.tripGroupProfissional.deleteMany({
      where: { tenantId: params.tenantId, tripGroupId: params.tripGroupId, professionalId: params.professionalId, papel: params.papel },
    });
    if (result.count === 0) return false;
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "GRUPO_PROFISSIONAL_REMOVIDO",
      entidade: "TripGroup",
      entidadeId: params.tripGroupId,
      resultado: "ok",
      detalhe: { professionalId: params.professionalId, papel: params.papel },
    });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Vincular/desvincular Booking a um Group — só dentro da MESMA Trip do
// Booking (validado, nunca só assumido pela UI), com checagem de
// capacidade do veículo somando passageiros dos Bookings já no grupo.
// ---------------------------------------------------------------------------

export type VincularBookingGrupoResultado =
  | { ok: true }
  | { ok: false; motivo: "GRUPO_NAO_ENCONTRADO" | "BOOKING_NAO_ENCONTRADO" | "TRIP_DIVERGENTE" | "CAPACIDADE_EXCEDIDA" };

export async function vincularBookingAoGrupo(
  prisma: PrismaClient,
  params: { tenantId: string; tripGroupId: string; bookingId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<VincularBookingGrupoResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const grupo = await tx.tripGroup.findUnique({ where: { id: params.tripGroupId }, include: { veiculo: true } });
    if (!grupo) return { ok: false, motivo: "GRUPO_NAO_ENCONTRADO" };
    const booking = await tx.booking.findUnique({ where: { id: params.bookingId }, include: { travelers: true } });
    if (!booking) return { ok: false, motivo: "BOOKING_NAO_ENCONTRADO" };
    if (booking.tripId !== grupo.tripId) return { ok: false, motivo: "TRIP_DIVERGENTE" };

    const bookingsDoGrupo = await tx.booking.findMany({ where: { tenantId: params.tenantId, tripGroupId: grupo.id }, include: { travelers: true } });
    const ocupacaoAtual = bookingsDoGrupo.filter((b) => b.id !== booking.id).reduce((soma, b) => soma + b.travelers.length, 0);
    if (ocupacaoAtual + booking.travelers.length > grupo.veiculo.capacidade) return { ok: false, motivo: "CAPACIDADE_EXCEDIDA" };

    await tx.booking.update({ where: { id: booking.id }, data: { tripGroupId: grupo.id } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "BOOKING_VINCULADO_GRUPO",
      entidade: "Booking",
      entidadeId: booking.id,
      resultado: "ok",
      detalhe: { tripGroupId: grupo.id },
    });
    return { ok: true };
  });
}

export async function desvincularBookingDoGrupo(
  prisma: PrismaClient,
  params: { tenantId: string; bookingId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<boolean> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: params.bookingId } });
    if (!booking || !booking.tripGroupId) return false;
    await tx.booking.update({ where: { id: booking.id }, data: { tripGroupId: null } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "BOOKING_DESVINCULADO_GRUPO",
      entidade: "Booking",
      entidadeId: booking.id,
      resultado: "ok",
      detalhe: { tripGroupIdAnterior: booking.tripGroupId },
    });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Progresso de parada — por (Group × Activity), nunca só por Activity (dois
// Groups da mesma Trip podem estar em paradas diferentes ao mesmo tempo).
// Marcar uma parada como ATUAL move automaticamente qualquer outra parada
// ATUAL do mesmo grupo para CONCLUIDA (mesma regra funcional da 0.4.11,
// `Experience.php::stopProgress`). Não envolve GPS (§16 do comando).
// ---------------------------------------------------------------------------

export async function atualizarProgressoParada(
  prisma: PrismaClient,
  params: { tenantId: string; tripGroupId: string; tripActivityId: string; status: TripActivityProgressStatus; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<{ ok: true; progresso: TripActivityProgress } | { ok: false; motivo: "GRUPO_NAO_ENCONTRADO" | "ATIVIDADE_NAO_ENCONTRADA" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const grupo = await tx.tripGroup.findUnique({ where: { id: params.tripGroupId } });
    if (!grupo) return { ok: false, motivo: "GRUPO_NAO_ENCONTRADO" };
    const atividade = await tx.tripActivity.findUnique({ where: { id: params.tripActivityId } });
    if (!atividade) return { ok: false, motivo: "ATIVIDADE_NAO_ENCONTRADA" };

    if (params.status === "ATUAL") {
      await tx.tripActivityProgress.updateMany({
        where: { tenantId: params.tenantId, tripGroupId: grupo.id, status: "ATUAL" },
        data: { status: "CONCLUIDA" },
      });
    }

    const progresso = await tx.tripActivityProgress.upsert({
      where: { tenantId_tripGroupId_tripActivityId: { tenantId: params.tenantId, tripGroupId: grupo.id, tripActivityId: atividade.id } },
      update: { status: params.status, atualizadoPorId: params.actorType === "HUMANO" ? (params.userId ?? null) : null },
      create: {
        tenantId: params.tenantId,
        tripGroupId: grupo.id,
        tripActivityId: atividade.id,
        status: params.status,
        atualizadoPorId: params.actorType === "HUMANO" ? (params.userId ?? null) : null,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "PROGRESSO_PARADA_ALTERADO",
      entidade: "TripActivityProgress",
      entidadeId: progresso.id,
      resultado: "ok",
      detalhe: { tripActivityId: atividade.id, status: params.status },
    });
    return { ok: true, progresso };
  });
}

// ---------------------------------------------------------------------------
// PM-CONV-06 — parada atual/próxima, fonte única (Central de Operações E
// `/minha-viagem` do passageiro reaproveitam esta MESMA derivação, nunca
// cada um calculando por conta própria). Sempre a partir de
// `TripActivityProgress` real (o que `atualizarProgressoParada` escreve) —
// nunca fabrica ETA/horário estimado, só o que já existe.
// ---------------------------------------------------------------------------

export interface AtividadeParaProgresso {
  id: string;
  nome: string;
  local: string | null;
}

export interface ParadaAtualProxima<T extends AtividadeParaProgresso> {
  atual: T | null;
  proxima: T | null;
}

export function derivarParadaAtualProxima<T extends AtividadeParaProgresso>(
  atividadesEmOrdem: T[],
  progresso: { tripActivityId: string; status: TripActivityProgressStatus }[],
): ParadaAtualProxima<T> {
  const statusPorAtividade = new Map(progresso.map((p) => [p.tripActivityId, p.status]));
  const indiceAtual = atividadesEmOrdem.findIndex((a) => statusPorAtividade.get(a.id) === "ATUAL");
  const atual = indiceAtual >= 0 ? atividadesEmOrdem[indiceAtual]! : null;
  const proxima =
    indiceAtual >= 0
      ? (atividadesEmOrdem.slice(indiceAtual + 1).find((a) => statusPorAtividade.get(a.id) !== "CONCLUIDA" && statusPorAtividade.get(a.id) !== "PULADA") ?? null)
      : (atividadesEmOrdem.find((a) => !statusPorAtividade.has(a.id) || statusPorAtividade.get(a.id) === "PLANEJADA") ?? null);
  return { atual, proxima };
}

/**
 * Combina a data de um dia do itinerário (`TripItineraryDay.data`) com um
 * horário livre (`TripActivity.horaInicio`, ex. "09:00") no timezone IANA da
 * Trip, devolvendo o instante real em UTC — ou `null` se `horaInicio` não
 * estiver preenchido (não há como comparar contra "agora" sem hora).
 *
 * Fonte única para "próxima atividade por horário real" (diferente de
 * `derivarParadaAtualProxima`, que é baseada em status marcado pelo guia, não
 * em relógio) — usada por `viagem.proxima_atividade`. Sem dependência nova:
 * `packages/db` não tinha date-fns-tz/luxon (conferido), então isto usa
 * Intl.DateTimeFormat nativo para achar o offset do timezone na data em
 * questão (correto mesmo em mudança de horário de verão).
 */
export function combinarDataHoraNoTimezone(data: Date, horaInicio: string | null, timezone: string): Date | null {
  if (!horaInicio) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(horaInicio.trim());
  if (!match) return null;
  const hora = Number(match[1]);
  const minuto = Number(match[2]);

  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth();
  const dia = data.getUTCDate();

  // Palpite inicial em UTC, depois corrigido pelo offset real do timezone
  // nesse dia específico (Intl já resolve DST corretamente).
  const palpiteUtc = new Date(Date.UTC(ano, mes, dia, hora, minuto));
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(palpiteUtc);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const comoUtcSeNoTimezone = Date.UTC(valor("year"), valor("month") - 1, valor("day"), valor("hour"), valor("minute"), valor("second"));
  const offsetMs = comoUtcSeNoTimezone - palpiteUtc.getTime();

  return new Date(palpiteUtc.getTime() - offsetMs);
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export async function listarGruposDaTrip(prisma: PrismaClient, tenantId: string, tripId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.tripGroup.findMany({
      where: { tenantId, tripId },
      include: { veiculo: true, profissionais: { include: { professional: true } }, bookings: { include: { travelers: true } }, progresso: true },
      orderBy: { createdAt: "asc" },
    }),
  );
}

export async function buscarGrupo(prisma: PrismaClient, tenantId: string, tripGroupId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.tripGroup.findUnique({
      where: { id: tripGroupId },
      include: {
        trip: { include: { itinerarioDias: { include: { atividades: true }, orderBy: { numeroDia: "asc" } } } },
        veiculo: true,
        profissionais: { include: { professional: true } },
        bookings: { include: { travelers: true, lead: { include: { contact: true } } } },
        progresso: true,
      },
    }),
  );
}

export async function listarVeiculosDisponiveisParaGrupo(prisma: PrismaClient, tenantId: string) {
  return withTenant(prisma, tenantId, (tx) => tx.tourVehicle.findMany({ where: { tenantId, ativo: true }, orderBy: { nome: "asc" } }));
}

/** PM-CONV-05, Track A/B — grupos operacionais em que um profissional está atribuído, pro app dele saber onde pode iniciar tracking/check-in. */
export async function listarGruposDoProfissional(prisma: PrismaClient, tenantId: string, professionalId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.tripGroup.findMany({
      where: { tenantId, profissionais: { some: { professionalId } }, trip: { status: { notIn: ["CONCLUIDA", "CANCELADA"] } } },
      include: { trip: true, veiculo: true },
      orderBy: { createdAt: "desc" },
    }),
  );
}
