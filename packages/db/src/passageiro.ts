import type { PrismaClient } from "@prisma/client";
import { withSystem } from "./tenant-db";
import { hashToken } from "./check-in";
import { derivarParadaAtualProxima } from "./trip-group";
import { registrarAvaliacao } from "./post-trip";

/**
 * PM-CONV-05, Track B — Mobile/PWA do passageiro. Reaproveita a MESMA
 * credencial opaca do Track A (check-in.ts) como mecanismo de acesso —
 * nenhum sistema de login novo pro passageiro (ele não é um `User`).
 * Escopo estritamente do PRÓPRIO passageiro/grupo do token: nunca vaza
 * dado de outro passageiro, nem `instrucoes` (interna) nem atividade com
 * `visivelParaViajante=false`.
 *
 * Usa `withSystem` (bypass de RLS) de propósito: esta rota é pública, sem
 * sessão — não há tenantId conhecido de antemão. Mesmo padrão já usado no
 * login (encontrar o tenant de um usuário antes de ter contexto de
 * tenant). Seguro porque o lookup é por um hash SHA-256 de um token
 * aleatório de 48 hex chars, globalmente único no banco — nunca por um id
 * previsível.
 */

export interface ContextoPassageiro {
  travelerNome: string;
  statusCheckIn: string;
  roteiro: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  grupoNome: string;
  crew: { nome: string; papel: string; telefone: string | null }[];
  itinerario: { numeroDia: number; diaTitulo: string | null; atividades: { nome: string; local: string | null; horaInicio: string | null }[] }[];
  /** Mesma derivação da Central de Operações (`operations.ts`) — nunca ETA fabricada, só o que o guia/motorista já marcou de verdade. */
  paradaAtual: { nome: string; local: string | null } | null;
  proximaParada: { nome: string; local: string | null } | null;
  /** PM-CONV-10 — só true quando a reserva já está CONCLUIDA e ainda não existe avaliação registrada (uma por reserva). */
  podeAvaliar: boolean;
}

export type ObterContextoPassageiroResultado = { ok: true; contexto: ContextoPassageiro } | { ok: false; motivo: "FORMATO_INVALIDO" | "NAO_ENCONTRADA" | "EXPIRADA" | "REVOGADA" };

const TOKEN_REGEX = /^[a-f0-9]{48}$/;

export async function obterContextoPassageiro(prisma: PrismaClient, tokenBruto: string): Promise<ObterContextoPassageiroResultado> {
  if (typeof tokenBruto !== "string" || tokenBruto.length === 0 || tokenBruto.length > 200) return { ok: false, motivo: "FORMATO_INVALIDO" };
  const token = tokenBruto.trim();
  if (!TOKEN_REGEX.test(token)) return { ok: false, motivo: "FORMATO_INVALIDO" };

  const hash = hashToken(token);

  return withSystem(prisma, async (tx) => {
    const checkin = await tx.travelerCheckIn.findFirst({
      where: { credencialTokenHash: hash },
      include: {
        traveler: { include: { booking: { include: { tripReview: true } } } },
        tripGroup: {
          include: {
            trip: { include: { itinerarioDias: { orderBy: { numeroDia: "asc" }, include: { atividades: { orderBy: { horaInicio: "asc" } } } } } },
            profissionais: { include: { professional: true } },
            progresso: true,
          },
        },
      },
    });
    if (!checkin) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (checkin.credencialRevogadaEm) return { ok: false, motivo: "REVOGADA" };
    if (!checkin.credencialExpiraEm || checkin.credencialExpiraEm < new Date()) return { ok: false, motivo: "EXPIRADA" };

    const grupo = checkin.tripGroup;
    // Mesma regra de visibilidade de sempre (`visivelParaViajante`) também
    // vale pra derivação de parada atual/próxima — uma atividade interna
    // nunca aparece pro passageiro nem como "parada atual".
    const atividadesVisiveis = grupo.trip.itinerarioDias.flatMap((d) => d.atividades).filter((a) => a.visivelParaViajante);
    const { atual, proxima } = derivarParadaAtualProxima(atividadesVisiveis, grupo.progresso);

    return {
      ok: true,
      contexto: {
        travelerNome: checkin.traveler.nome,
        statusCheckIn: checkin.status,
        roteiro: grupo.trip.roteiro,
        dataInicio: grupo.trip.dataInicio.toISOString(),
        dataFim: grupo.trip.dataFim.toISOString(),
        grupoNome: grupo.nome,
        crew: grupo.profissionais.map((p) => ({ nome: p.professional.nome, papel: p.papel, telefone: p.professional.telefone })),
        itinerario: grupo.trip.itinerarioDias.map((dia) => ({
          numeroDia: dia.numeroDia,
          diaTitulo: dia.titulo,
          atividades: dia.atividades.filter((a) => a.visivelParaViajante).map((a) => ({ nome: a.nome, local: a.local, horaInicio: a.horaInicio })),
        })),
        paradaAtual: atual ? { nome: atual.nome, local: atual.local } : null,
        proximaParada: proxima ? { nome: proxima.nome, local: proxima.local } : null,
        podeAvaliar: checkin.traveler.booking.status === "CONCLUIDA" && !checkin.traveler.booking.tripReview,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Avaliação pós-viagem (PM-CONV-10) — mesma credencial, mesmo padrão de
// revalidação do token a cada chamada (nunca confia numa sessão/estado
// anterior). O cliente nunca escolhe o Booking — ele vem do PRÓPRIO
// token, exatamente como todo o resto deste módulo.
// ---------------------------------------------------------------------------

export interface RegistrarAvaliacaoPassageiroParams {
  nota: number;
  comentario?: string | null;
  depoimentoAutorizado?: boolean;
}

export type RegistrarAvaliacaoPassageiroResultado =
  | { ok: true }
  | { ok: false; motivo: "FORMATO_INVALIDO" | "NAO_ENCONTRADA" | "EXPIRADA" | "REVOGADA" | "VIAGEM_NAO_CONCLUIDA" | "NOTA_INVALIDA" | "JA_AVALIADA" };

export async function registrarAvaliacaoPassageiro(prisma: PrismaClient, tokenBruto: string, params: RegistrarAvaliacaoPassageiroParams): Promise<RegistrarAvaliacaoPassageiroResultado> {
  if (typeof tokenBruto !== "string" || tokenBruto.length === 0 || tokenBruto.length > 200) return { ok: false, motivo: "FORMATO_INVALIDO" };
  const token = tokenBruto.trim();
  if (!TOKEN_REGEX.test(token)) return { ok: false, motivo: "FORMATO_INVALIDO" };

  const hash = hashToken(token);
  const checkin = await withSystem(prisma, (tx) => tx.travelerCheckIn.findFirst({ where: { credencialTokenHash: hash }, include: { traveler: true } }));
  if (!checkin) return { ok: false, motivo: "NAO_ENCONTRADA" };
  if (checkin.credencialRevogadaEm) return { ok: false, motivo: "REVOGADA" };
  if (!checkin.credencialExpiraEm || checkin.credencialExpiraEm < new Date()) return { ok: false, motivo: "EXPIRADA" };

  const r = await registrarAvaliacao(prisma, {
    tenantId: checkin.tenantId,
    bookingId: checkin.traveler.bookingId,
    nota: params.nota,
    comentario: params.comentario,
    depoimentoAutorizado: params.depoimentoAutorizado,
  });
  if (!r.ok) {
    if (r.motivo === "BOOKING_NAO_ENCONTRADO") return { ok: false, motivo: "NAO_ENCONTRADA" };
    return { ok: false, motivo: r.motivo };
  }
  return { ok: true };
}
