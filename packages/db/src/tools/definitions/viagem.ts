import { z } from "zod";
import { withTenant } from "../../tenant-db";
import { defineTool } from "../types";
import { combinarDataHoraNoTimezone } from "../../trip-group";
import { obterPosicoesAtivasDoGrupo } from "../../geolocation";

/**
 * PM-CONV-05, Track D — tool de contexto REAL de viagem para o Yalla.
 * Antes desta tool, o Yalla só tinha acesso a Lead/Contact/Note — nada de
 * Booking/Trip/Itinerário. "Contexto autorizado da viagem" (§ do comando)
 * significa responder com dado real do CRM, nunca inventar data de embarque,
 * roteiro ou status — mesma disciplina de IDOR-by-construction das outras
 * tools: sempre `ctx.leadId`, nunca um id vindo do modelo.
 */

const viagemContextoOutput = z.object({
  temReserva: z.boolean(),
  bookings: z.array(
    z.object({
      bookingId: z.string(),
      statusBooking: z.string(),
      roteiro: z.string().nullable(),
      dataInicio: z.string().nullable(),
      dataFim: z.string().nullable(),
      statusViagem: z.string().nullable(),
      grupoOperacional: z.string().nullable(),
      quantidadePassageiros: z.number(),
      proximaAtividade: z.object({ nome: z.string(), dia: z.number(), diaTitulo: z.string().nullable() }).nullable(),
    }),
  ),
});

export const viagemConsultarContextoTool = defineTool({
  id: "viagem.consultar_contexto",
  nome: "Consultar contexto de viagem do lead",
  descricao:
    "Consulta as reservas (bookings) e a operação de viagem (roteiro, datas, status, próxima atividade do itinerário) do lead associado à conversa atual — dado real do CRM, nunca inventa data/roteiro. Use antes de responder qualquer pergunta sobre embarque, roteiro ou status da viagem do cliente.",
  capability: "viagem.consultar_contexto",
  risk: "READ_ONLY",
  inputSchema: z.object({}),
  outputSchema: viagemContextoOutput,
  sideEffects: false,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: false,
  async handler(prisma, ctx) {
    if (!ctx.leadId) return { temReserva: false, bookings: [] };

    const bookings = await withTenant(prisma, ctx.tenantId, (tx) =>
      tx.booking.findMany({
        where: { tenantId: ctx.tenantId, leadId: ctx.leadId! },
        include: {
          travelers: true,
          tripGroup: true,
          trip: {
            include: {
              itinerarioDias: {
                orderBy: { numeroDia: "asc" },
                include: { atividades: { include: { progresso: true }, orderBy: { horaInicio: "asc" } } },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    );

    if (bookings.length === 0) return { temReserva: false, bookings: [] };

    return {
      temReserva: true,
      bookings: bookings.map((b) => {
        let proximaAtividade: { nome: string; dia: number; diaTitulo: string | null } | null = null;
        for (const dia of b.trip?.itinerarioDias ?? []) {
          for (const atividade of dia.atividades) {
            const status = atividade.progresso.find((p) => p.tripGroupId === b.tripGroupId)?.status ?? "PLANEJADA";
            if (status === "PLANEJADA" || status === "ATUAL") {
              proximaAtividade = { nome: atividade.nome, dia: dia.numeroDia, diaTitulo: dia.titulo };
              break;
            }
          }
          if (proximaAtividade) break;
        }

        return {
          bookingId: b.id,
          statusBooking: b.status,
          roteiro: b.trip?.roteiro ?? null,
          dataInicio: b.trip?.dataInicio.toISOString() ?? null,
          dataFim: b.trip?.dataFim.toISOString() ?? null,
          statusViagem: b.trip?.status ?? null,
          grupoOperacional: b.tripGroup?.nome ?? null,
          quantidadePassageiros: b.travelers.length,
          proximaAtividade,
        };
      }),
    };
  },
});

/**
 * Base de Conhecimento da Yalla — diferente de `viagem.consultar_contexto`
 * (baseado em STATUS marcado pelo guia), esta tool responde "que horas
 * saímos" por HORÁRIO REAL: combina `TripItineraryDay.data` +
 * `TripActivity.horaInicio` no timezone da própria Trip e acha a primeira
 * atividade cujo instante ainda não passou. Atividade sem `horaInicio`
 * preenchido é ignorada aqui (não dá pra comparar contra "agora" sem hora) —
 * `viagem.consultar_contexto` continua sendo a fonte pra "o que vem depois"
 * quando o horário em si não importa.
 */
const viagemProximaAtividadeOutput = z.object({
  temProxima: z.boolean(),
  atividade: z
    .object({
      nome: z.string(),
      local: z.string().nullable(),
      horaInicio: z.string().nullable(),
      dia: z.number(),
      diaTitulo: z.string().nullable(),
      data: z.string(),
    })
    .nullable(),
});

export const viagemProximaAtividadeTool = defineTool({
  id: "viagem.proxima_atividade",
  nome: "Consultar próxima atividade agendada por horário",
  descricao:
    "Consulta a próxima atividade do itinerário do lead cujo horário real (data + hora, no timezone da viagem) ainda não passou — nunca inventa horário. Use para perguntas do tipo 'que horas saímos amanhã' ou 'qual a próxima atividade agendada'.",
  capability: "viagem.proxima_atividade",
  risk: "READ_ONLY",
  inputSchema: z.object({}),
  outputSchema: viagemProximaAtividadeOutput,
  sideEffects: false,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: false,
  async handler(prisma, ctx) {
    if (!ctx.leadId) return { temProxima: false, atividade: null };

    const booking = await withTenant(prisma, ctx.tenantId, (tx) =>
      tx.booking.findFirst({
        where: { tenantId: ctx.tenantId, leadId: ctx.leadId!, tripId: { not: null } },
        include: {
          trip: {
            include: {
              itinerarioDias: {
                orderBy: { data: "asc" },
                include: { atividades: { where: { visivelParaViajante: true }, orderBy: { horaInicio: "asc" } } },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    );

    const trip = booking?.trip;
    if (!trip) return { temProxima: false, atividade: null };

    const agora = new Date();
    for (const dia of trip.itinerarioDias) {
      for (const atividade of dia.atividades) {
        const instante = combinarDataHoraNoTimezone(dia.data, atividade.horaInicio, trip.timezone);
        if (instante && instante >= agora) {
          return {
            temProxima: true,
            atividade: { nome: atividade.nome, local: atividade.local, horaInicio: atividade.horaInicio, dia: dia.numeroDia, diaTitulo: dia.titulo, data: dia.data.toISOString() },
          };
        }
      }
    }
    return { temProxima: false, atividade: null };
  },
});

/**
 * Base de Conhecimento da Yalla — GPS do veículo/grupo do lead, com limiar
 * de "desatualizado" (10 min — não existia nenhum conceito de staleness no
 * projeto antes desta tool; ver geolocation.ts::obterPosicoesAtivasDoGrupo,
 * que devolve a posição mais recente sem filtro de idade nenhum). Resolução
 * de tripGroupId sempre via `ctx.leadId → Booking`, nunca de input do
 * modelo — mesmo padrão IDOR-safe de `viagem.consultar_contexto`.
 */
const LIMIAR_DESATUALIZADO_MS = 10 * 60 * 1000;

const viagemLocalizacaoVeiculoOutput = z.object({
  disponivel: z.boolean(),
  motivo: z.enum(["OK", "SEM_RESERVA_ATIVA", "SEM_SESSAO_ATIVA", "POSICAO_DESATUALIZADA"]),
  posicao: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      capturedAt: z.string(),
      profissionalNome: z.string(),
      idadeSegundos: z.number(),
    })
    .nullable(),
});

export const viagemLocalizacaoVeiculoTool = defineTool({
  id: "viagem.localizacao_veiculo",
  nome: "Consultar localização atual do veículo/grupo",
  descricao:
    "Consulta a última posição de GPS conhecida do veículo/grupo do lead, só se recente (menos de 10 minutos) — nunca apresenta uma posição antiga como se fosse atual. Use para perguntas do tipo 'onde está o ônibus' ou 'quanto falta para chegar'.",
  capability: "viagem.localizacao_veiculo",
  risk: "READ_ONLY",
  inputSchema: z.object({}),
  outputSchema: viagemLocalizacaoVeiculoOutput,
  sideEffects: false,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: false,
  async handler(prisma, ctx) {
    if (!ctx.leadId) return { disponivel: false, motivo: "SEM_RESERVA_ATIVA" as const, posicao: null };

    const booking = await withTenant(prisma, ctx.tenantId, (tx) =>
      tx.booking.findFirst({
        where: { tenantId: ctx.tenantId, leadId: ctx.leadId!, tripGroupId: { not: null } },
        orderBy: { createdAt: "desc" },
      }),
    );
    if (!booking?.tripGroupId) return { disponivel: false, motivo: "SEM_RESERVA_ATIVA" as const, posicao: null };

    const posicoes = await obterPosicoesAtivasDoGrupo(prisma, ctx.tenantId, booking.tripGroupId);
    if (posicoes.length === 0) return { disponivel: false, motivo: "SEM_SESSAO_ATIVA" as const, posicao: null };

    const maisRecente = posicoes.reduce((a, b) => (a.capturedAt > b.capturedAt ? a : b));
    const idadeMs = Date.now() - maisRecente.capturedAt.getTime();
    if (idadeMs > LIMIAR_DESATUALIZADO_MS) return { disponivel: false, motivo: "POSICAO_DESATUALIZADA" as const, posicao: null };

    return {
      disponivel: true,
      motivo: "OK" as const,
      posicao: {
        latitude: maisRecente.latitude,
        longitude: maisRecente.longitude,
        capturedAt: maisRecente.capturedAt.toISOString(),
        profissionalNome: maisRecente.professionalNome,
        idadeSegundos: Math.floor(idadeMs / 1000),
      },
    };
  },
});
