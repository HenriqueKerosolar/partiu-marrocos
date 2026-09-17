import { z } from "zod";
import { withTenant } from "../../tenant-db";
import { defineTool } from "../types";

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
