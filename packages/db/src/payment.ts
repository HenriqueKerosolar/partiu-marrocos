import type { PrismaClient, Payment, PaymentStatus, BookingStatus, ActorType, Prisma } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";
import { criarGate } from "./gates";
import { transicaoValidaBooking } from "./booking";
import { valorMaiorOuIgual, valorMaior } from "./money";
import { criarNotificacao } from "./notifications";

/**
 * Payment Foundation 01 (PM-NIGHT-RUN-02, Etapa 2) — domínio de pagamento
 * PROVIDER-NEUTRAL (§10 do comando: "PAYMENT ≠ GATEWAY"). Nenhum gateway
 * real (Stripe/Mercado Pago/PIX) está integrado nesta rodada — só o modo
 * MANUAL/OFFLINE (`provider: null`). **Isto é PAYMENT DOMAIN IMPLEMENTED,
 * NUNCA declarar PAYMENT PROVIDER LIVE** — nenhuma função aqui chama uma
 * API de pagamento externa, nenhuma credencial é usada ou inventada.
 *
 * Parcelamento: um Booking pode ter vários `Payment` — pagamento único é
 * um Booking com um Payment; sinal+saldo ou parcelas são vários Payment
 * com `vencimento` diferentes. Nenhum campo extra de "plano de parcelamento"
 * foi necessário — a própria tabela já suporta N parcelas como N linhas.
 */

// ---------------------------------------------------------------------------
// Máquina de estados — mesmo padrão de transicaoValida (Gates)/
// transicaoValidaBooking.
// ---------------------------------------------------------------------------

const TRANSICOES_VALIDAS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDENTE: ["PROCESSANDO", "PAGO", "PARCIALMENTE_PAGO", "FALHOU", "CANCELADO"],
  PROCESSANDO: ["PAGO", "PARCIALMENTE_PAGO", "FALHOU", "CANCELADO"],
  PARCIALMENTE_PAGO: ["PAGO", "PARCIALMENTE_REEMBOLSADO", "REEMBOLSADO"],
  PAGO: ["REEMBOLSADO", "PARCIALMENTE_REEMBOLSADO"],
  FALHOU: ["PENDENTE", "CANCELADO"], // retry volta pra PENDENTE
  CANCELADO: [],
  REEMBOLSADO: [],
  PARCIALMENTE_REEMBOLSADO: ["REEMBOLSADO"],
};

export function transicaoValidaPayment(de: PaymentStatus, para: PaymentStatus): boolean {
  return TRANSICOES_VALIDAS[de]?.includes(para) ?? false;
}

// ---------------------------------------------------------------------------
// Criação — pagamento único, sinal, ou uma parcela de um plano
// ---------------------------------------------------------------------------

export interface CriarPaymentParams {
  tenantId: string;
  bookingId: string;
  valor: number;
  moeda: string;
  method?: string | null;
  vencimento?: Date | null;
  idempotencyKey?: string | null;
  metadata?: unknown;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type CriarPaymentResultado = { ok: true; payment: Payment; criado: boolean } | { ok: false; motivo: "BOOKING_NAO_ENCONTRADO" | "MOEDA_DIVERGENTE" };

export async function criarPayment(prisma: PrismaClient, params: CriarPaymentParams): Promise<CriarPaymentResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: params.bookingId }, include: { proposal: true } });
    if (!booking) return { ok: false, motivo: "BOOKING_NAO_ENCONTRADO" };
    // PM-CONV-08 — achado real: nada aqui validava a moeda do Payment contra
    // a da Proposal do Booking. Sem essa checagem, dois Payments do mesmo
    // Booking podiam existir em moedas diferentes e `sincronizarStatusPagamentoBooking`/
    // `resumoPagamentoBooking` somariam os dois como se fossem a mesma
    // moeda (nenhum dos dois agrega por moeda, ao contrário de `dashboard.ts`).
    // Falha-fechado aqui, na criação, é mais seguro que tentar filtrar na soma.
    if (params.moeda !== booking.proposal.moeda) return { ok: false, motivo: "MOEDA_DIVERGENTE" };

    if (params.idempotencyKey) {
      const existente = await tx.payment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: params.tenantId, idempotencyKey: params.idempotencyKey } } });
      if (existente) return { ok: true, payment: existente, criado: false };
    }

    const payment = await tx.payment.create({
      data: {
        tenantId: params.tenantId,
        bookingId: booking.id,
        valor: params.valor,
        moeda: params.moeda,
        method: params.method ?? null,
        vencimento: params.vencimento ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "PAYMENT_CRIADO",
      entidade: "Payment",
      entidadeId: payment.id,
      resultado: "ok",
      detalhe: { bookingId: booking.id, valor: payment.valor, moeda: payment.moeda },
    });
    return { ok: true, payment, criado: true };
  });
}

// ---------------------------------------------------------------------------
// Registrar resultado de um pagamento (manual/offline nesta rodada —
// preparado para webhook futuro via idempotencyKey/providerReference)
// ---------------------------------------------------------------------------

export interface RegistrarResultadoPaymentParams {
  tenantId: string;
  paymentId: string;
  novoStatus: Extract<PaymentStatus, "PROCESSANDO" | "PAGO" | "PARCIALMENTE_PAGO" | "FALHOU" | "CANCELADO">;
  providerReference?: string | null;
  pagoEm?: Date | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type RegistrarResultadoResultado = { ok: true; payment: Payment } | { ok: false; motivo: "NAO_ENCONTRADO" | "TRANSICAO_INVALIDA" };

export async function registrarResultadoPayment(prisma: PrismaClient, params: RegistrarResultadoPaymentParams): Promise<RegistrarResultadoResultado> {
  const resultado = await withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.payment.findUnique({ where: { id: params.paymentId } });
    if (!atual) return { ok: false as const, motivo: "NAO_ENCONTRADO" as const };
    if (!transicaoValidaPayment(atual.status, params.novoStatus)) return { ok: false as const, motivo: "TRANSICAO_INVALIDA" as const };

    const payment = await tx.payment.update({
      where: { id: atual.id },
      data: {
        status: params.novoStatus,
        providerReference: params.providerReference ?? atual.providerReference,
        ...(params.novoStatus === "PAGO" || params.novoStatus === "PARCIALMENTE_PAGO" ? { pagoEm: params.pagoEm ?? new Date() } : {}),
        ...(params.novoStatus === "CANCELADO" ? { canceladoEm: new Date() } : {}),
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: params.novoStatus === "PAGO" ? "PAYMENT_CONFIRMADO" : params.novoStatus === "FALHOU" ? "PAYMENT_FALHOU" : params.novoStatus === "CANCELADO" ? "PAYMENT_CANCELADO" : "PAYMENT_REGISTRADO",
      entidade: "Payment",
      entidadeId: payment.id,
      resultado: "ok",
      detalhe: { de: atual.status, para: params.novoStatus },
    });
    return { ok: true as const, payment };
  });

  if (resultado.ok && (params.novoStatus === "PAGO" || params.novoStatus === "PARCIALMENTE_PAGO")) {
    await sincronizarStatusPagamentoBooking(prisma, { tenantId: params.tenantId, bookingId: resultado.payment.bookingId, actorType: "SISTEMA" });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Sincroniza Booking.status a partir da soma de Payments PAGO — nunca força
// uma transição que a máquina de estados do Booking não permite (ex.: um
// Booking já CONFIRMADA/EM_OPERACAO não regride por conta disto).
// ---------------------------------------------------------------------------

export async function sincronizarStatusPagamentoBooking(
  prisma: PrismaClient,
  params: { tenantId: string; bookingId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<void> {
  await withTenant(prisma, params.tenantId, async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: params.bookingId }, include: { proposal: true } });
    if (!booking) return;
    if (booking.status !== "AGUARDANDO_PAGAMENTO" && booking.status !== "PAGAMENTO_PARCIAL") return; // só mexe nos 2 estados iniciais — nunca regride um Booking mais avançado

    const agregado = await tx.payment.aggregate({ where: { tenantId: params.tenantId, bookingId: booking.id, status: "PAGO" }, _sum: { valor: true } });
    const totalPago = agregado._sum.valor ?? 0;
    // PM-CONV-08 — achado real: comparação float direta aqui deixava um
    // Booking pago em parcelas "quebradas" (ex.: 3x R$1,99 + 1x R$2,01)
    // preso em PAGAMENTO_PARCIAL para sempre, mesmo com o valor exato pago
    // (erro de representação binária de fração decimal — reproduzido e
    // corrigido comparando em centavos, ver `money.ts`).
    const alvo: BookingStatus = valorMaiorOuIgual(totalPago, booking.proposal.preco) ? "PAGO" : totalPago > 0 ? "PAGAMENTO_PARCIAL" : "AGUARDANDO_PAGAMENTO";
    if (alvo === booking.status) return;
    if (!transicaoValidaBooking(booking.status, alvo)) return;

    await tx.booking.update({ where: { id: booking.id }, data: { status: alvo } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "BOOKING_STATUS_ALTERADO",
      entidade: "Booking",
      entidadeId: booking.id,
      resultado: "ok",
      detalhe: { de: booking.status, para: alvo, motivo: "sincronizacao_pagamento", totalPago },
    });

    // PM-CONV-10 — Notifications Foundation: primeiro evento real cabeado
    // (§ do comando: "pagamento" está na lista explícita de eventos que já
    // existem). Só quando o Booking vira PAGO de verdade (não em toda
    // sincronização) e só quando há um responsável real pra notificar.
    if (alvo === "PAGO" && booking.responsavelId) {
      await criarNotificacao(prisma, {
        tenantId: params.tenantId,
        destinatarioId: booking.responsavelId,
        tipo: "pagamento_recebido",
        titulo: "Reserva paga",
        corpo: `A reserva de "${booking.proposal.moeda} ${booking.proposal.preco}" foi paga integralmente.`,
        entidadeTipo: "Booking",
        entidadeId: booking.id,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Estorno/reembolso — SEMPRE via Gate FINANCEIRO (§13 do comando: "Refund/
// estorno relevante deve integrar Gate"). Yalla pode solicitar, nunca
// autoaprovar — mesmo padrão de `enviarProposta`/Gate COMERCIAL.
// ---------------------------------------------------------------------------

export interface SolicitarEstornoParams {
  tenantId: string;
  paymentId: string;
  valorEstorno: number;
  motivo: string;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type SolicitarEstornoResultado = { ok: true; gateId: string } | { ok: false; motivo: "NAO_ENCONTRADO" | "STATUS_NAO_PERMITE_ESTORNO" | "VALOR_INVALIDO" };

export async function solicitarEstornoPayment(prisma: PrismaClient, params: SolicitarEstornoParams): Promise<SolicitarEstornoResultado> {
  const atual = await withTenant(prisma, params.tenantId, (tx) => tx.payment.findUnique({ where: { id: params.paymentId } }));
  if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };
  if (atual.status !== "PAGO" && atual.status !== "PARCIALMENTE_PAGO") return { ok: false, motivo: "STATUS_NAO_PERMITE_ESTORNO" };
  if (params.valorEstorno <= 0 || valorMaior(params.valorEstorno, atual.valor)) return { ok: false, motivo: "VALOR_INVALIDO" };

  return withTenant(prisma, params.tenantId, async (tx) => {
    const gate = await criarGate(prisma, {
      tenantId: params.tenantId,
      categoria: "FINANCEIRO",
      acaoProposta: `Estornar ${atual.moeda} ${params.valorEstorno} do pagamento ${atual.id}`,
      motivo: params.motivo,
      solicitanteTipo: params.actorType,
      solicitanteId: params.actorType === "HUMANO" ? (params.userId ?? undefined) : undefined,
      solicitanteLabel: params.actorType !== "HUMANO" ? (params.actorLabel ?? undefined) : undefined,
      metadata: { paymentId: atual.id, valorEstorno: params.valorEstorno },
    });
    await tx.payment.update({ where: { id: atual.id }, data: { gateId: gate.id } });
    return { ok: true as const, gateId: gate.id };
  });
}

export type ConfirmarEstornoResultado =
  | { ok: true; status: "REEMBOLSADO" | "PARCIALMENTE_REEMBOLSADO"; payment: Payment; jaAplicado: boolean }
  | { ok: true; status: "GATE_PENDENTE" }
  | { ok: true; status: "GATE_NEGADO" }
  | { ok: false; motivo: "NAO_ENCONTRADO" | "SEM_GATE_ASSOCIADO" };

/**
 * Rechecagem humana pós-decisão do Gate — mesmo padrão de
 * `confirmarEnvioAposAprovacaoGate` (Proposal). Só aplica o estorno de fato
 * depois de Gate APROVADO por um decisor humano real.
 *
 * Idempotente de verdade: diferente de um simples "reaplica se aprovado"
 * (que para Proposal é inofensivo — reenviar ENVIADA de novo não muda
 * valor), aqui reaplicar cegamente DUPLICARIA o valor estornado. Por isso,
 * se o Payment já não está mais em PAGO/PARCIALMENTE_PAGO (ou seja, este
 * Gate já foi consumido numa chamada anterior), a função retorna o estado
 * já aplicado (`jaAplicado: true`) em vez de estornar de novo.
 */
export async function confirmarEstornoAposAprovacaoGate(prisma: PrismaClient, params: { tenantId: string; paymentId: string }): Promise<ConfirmarEstornoResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.payment.findUnique({ where: { id: params.paymentId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };
    if (!atual.gateId) return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };

    const gate = await tx.gate.findUnique({ where: { id: atual.gateId } });
    if (!gate) return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };
    if (gate.status === "PENDENTE") return { ok: true, status: "GATE_PENDENTE" };
    if (gate.status !== "APROVADO") return { ok: true, status: "GATE_NEGADO" };

    if (atual.status === "REEMBOLSADO" || atual.status === "PARCIALMENTE_REEMBOLSADO") {
      return { ok: true, status: atual.status, payment: atual, jaAplicado: true };
    }

    const meta = (gate.metadata as { valorEstorno?: number } | null) ?? {};
    const valorEstorno = meta.valorEstorno ?? atual.valor;
    const totalEstornado = (atual.valorEstornado ?? 0) + valorEstorno;
    const novoStatus: PaymentStatus = valorMaiorOuIgual(totalEstornado, atual.valor) ? "REEMBOLSADO" : "PARCIALMENTE_REEMBOLSADO";
    if (!transicaoValidaPayment(atual.status, novoStatus)) return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };

    const payment = await tx.payment.update({
      where: { id: atual.id },
      data: { status: novoStatus, estornadoEm: new Date(), valorEstornado: totalEstornado },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: "SISTEMA",
      acao: "PAYMENT_ESTORNADO",
      entidade: "Payment",
      entidadeId: payment.id,
      resultado: "ok",
      detalhe: { gateId: gate.id, valorEstorno, totalEstornado, novoStatus },
    });
    return { ok: true, status: novoStatus as "REEMBOLSADO" | "PARCIALMENTE_REEMBOLSADO", payment, jaAplicado: false };
  });
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export async function listarPaymentsDoBooking(prisma: PrismaClient, tenantId: string, bookingId: string): Promise<Payment[]> {
  return withTenant(prisma, tenantId, (tx) => tx.payment.findMany({ where: { tenantId, bookingId }, orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }] }));
}

export interface ResumoPagamentoBooking {
  totalDevido: number;
  totalPago: number;
  totalPendente: number;
  moeda: string | null;
  quitado: boolean;
}

export async function resumoPagamentoBooking(prisma: PrismaClient, tenantId: string, bookingId: string): Promise<ResumoPagamentoBooking> {
  return withTenant(prisma, tenantId, async (tx) => {
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { proposal: true } });
    const payments = await tx.payment.findMany({ where: { tenantId, bookingId } });
    const totalPago = payments.filter((p) => p.status === "PAGO").reduce((s, p) => s + p.valor, 0);
    const totalPendente = payments.filter((p) => p.status === "PENDENTE" || p.status === "PROCESSANDO").reduce((s, p) => s + p.valor, 0);
    return {
      totalDevido: booking.proposal.preco,
      totalPago,
      totalPendente,
      moeda: booking.proposal.moeda,
      quitado: valorMaiorOuIgual(totalPago, booking.proposal.preco),
    };
  });
}
