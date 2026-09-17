import type { PrismaClient, TripReview, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-10 — Post-Trip Foundation. Avaliação/NPS + depoimento do
 * cliente, sempre ligada a um Booking `CONCLUIDA` (nunca durante a viagem,
 * nunca sem pagamento). `depoimentoAutorizado` (consentimento do cliente)
 * e `depoimentoPublicado` (decisão de um humano da equipe) são
 * deliberadamente campos SEPARADOS — consentir nunca publica sozinho, e o
 * banco garante isso estruturalmente (CHECK constraint), não só o código.
 */

export interface RegistrarAvaliacaoParams {
  tenantId: string;
  bookingId: string;
  nota: number;
  comentario?: string | null;
  depoimentoAutorizado?: boolean;
}

export type RegistrarAvaliacaoResultado =
  | { ok: true; review: TripReview }
  | { ok: false; motivo: "BOOKING_NAO_ENCONTRADO" | "VIAGEM_NAO_CONCLUIDA" | "NOTA_INVALIDA" | "JA_AVALIADA" };

export async function registrarAvaliacao(prisma: PrismaClient, params: RegistrarAvaliacaoParams): Promise<RegistrarAvaliacaoResultado> {
  if (!Number.isInteger(params.nota) || params.nota < 1 || params.nota > 5) return { ok: false, motivo: "NOTA_INVALIDA" };

  return withTenant(prisma, params.tenantId, async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: params.bookingId } });
    if (!booking) return { ok: false, motivo: "BOOKING_NAO_ENCONTRADO" };
    if (booking.status !== "CONCLUIDA") return { ok: false, motivo: "VIAGEM_NAO_CONCLUIDA" };

    const existente = await tx.tripReview.findUnique({ where: { tenantId_bookingId: { tenantId: params.tenantId, bookingId: booking.id } } });
    if (existente) return { ok: false, motivo: "JA_AVALIADA" };

    const review = await tx.tripReview.create({
      data: {
        tenantId: params.tenantId,
        bookingId: booking.id,
        nota: params.nota,
        comentario: params.comentario?.trim() || null,
        depoimentoAutorizado: params.depoimentoAutorizado ?? false,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: "HUMANO", // sempre o próprio cliente, via credencial — nunca um agente/sistema decidindo a nota por ele
      userId: null,
      actorLabel: "passageiro (via credencial)",
      acao: "AVALIACAO_REGISTRADA",
      entidade: "TripReview",
      entidadeId: review.id,
      resultado: "ok",
      detalhe: { bookingId: booking.id, nota: params.nota, depoimentoAutorizado: review.depoimentoAutorizado },
    });
    return { ok: true, review };
  });
}

export type PublicarDepoimentoResultado = { ok: true; review: TripReview } | { ok: false; motivo: "NAO_ENCONTRADA" | "SEM_CONSENTIMENTO" };

/** Sempre uma decisão humana explícita (§ "nunca publicação automática") — nunca chamada a partir de `registrarAvaliacao`. */
export async function publicarDepoimento(prisma: PrismaClient, params: { tenantId: string; tripReviewId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null }): Promise<PublicarDepoimentoResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.tripReview.findUnique({ where: { id: params.tripReviewId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (!atual.depoimentoAutorizado) return { ok: false, motivo: "SEM_CONSENTIMENTO" };
    if (atual.depoimentoPublicado) return { ok: true, review: atual };

    const review = await tx.tripReview.update({
      where: { id: atual.id },
      data: { depoimentoPublicado: true, publicadoPorId: params.actorType === "HUMANO" ? (params.userId ?? null) : null, publicadoEm: new Date() },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "DEPOIMENTO_PUBLICADO",
      entidade: "TripReview",
      entidadeId: review.id,
      resultado: "ok",
      detalhe: { bookingId: review.bookingId },
    });
    return { ok: true, review };
  });
}

export async function despublicarDepoimento(prisma: PrismaClient, params: { tenantId: string; tripReviewId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null }): Promise<PublicarDepoimentoResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.tripReview.findUnique({ where: { id: params.tripReviewId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (!atual.depoimentoPublicado) return { ok: true, review: atual };

    const review = await tx.tripReview.update({ where: { id: atual.id }, data: { depoimentoPublicado: false } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "DEPOIMENTO_DESPUBLICADO",
      entidade: "TripReview",
      entidadeId: review.id,
      resultado: "ok",
      detalhe: { bookingId: review.bookingId },
    });
    return { ok: true, review };
  });
}

export interface AvaliacaoResumo {
  id: string;
  bookingId: string;
  nota: number;
  comentario: string | null;
  depoimentoAutorizado: boolean;
  depoimentoPublicado: boolean;
  createdAt: Date;
  roteiro: string | null;
  travelerNomes: string[];
}

export async function listarAvaliacoesDoTenant(prisma: PrismaClient, tenantId: string): Promise<AvaliacaoResumo[]> {
  const reviews = await withTenant(prisma, tenantId, (tx) =>
    tx.tripReview.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: { booking: { include: { trip: true, travelers: true } } },
    }),
  );
  return reviews.map((r) => ({
    id: r.id,
    bookingId: r.bookingId,
    nota: r.nota,
    comentario: r.comentario,
    depoimentoAutorizado: r.depoimentoAutorizado,
    depoimentoPublicado: r.depoimentoPublicado,
    createdAt: r.createdAt,
    roteiro: r.booking.trip?.roteiro ?? null,
    travelerNomes: r.booking.travelers.map((t) => t.nome),
  }));
}

export async function buscarAvaliacaoDoBooking(prisma: PrismaClient, tenantId: string, bookingId: string): Promise<TripReview | null> {
  return withTenant(prisma, tenantId, (tx) => tx.tripReview.findUnique({ where: { tenantId_bookingId: { tenantId, bookingId } } }));
}
