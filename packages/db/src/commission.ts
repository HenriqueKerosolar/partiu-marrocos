import type { PrismaClient, Commission, CommissionStatus, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";
import { criarGate, calcularFingerprint, fingerprintCompativel } from "./gates";

/** Campos financeiros de uma Commission usados no fingerprint do Gate (§8C) — se qualquer um mudar entre aprovação e execução, a execução é recusada. */
function camposFingerprintComissao(c: Pick<Commission, "valor" | "moeda" | "percentual" | "baseCalculo">): Record<string, unknown> {
  return { valor: c.valor, moeda: c.moeda, percentual: c.percentual, baseCalculo: c.baseCalculo };
}
function fingerprintDaComissao(c: Pick<Commission, "valor" | "moeda" | "percentual" | "baseCalculo">): string {
  return calcularFingerprint(camposFingerprintComissao(c));
}

/**
 * Commission (PM-NIGHT-RUN-02, Etapa 3, §21) — comissão de venda.
 * Consumidor real: `Booking.responsavelId` (o vendedor responsável já
 * existe desde Booking Foundation 01). `beneficiarioId` é sempre um `User`
 * desta casa — parceiro/afiliado/agente externo exigiria uma entidade
 * `Partner` que não existe ainda (mesma lacuna documentada em Finance Core
 * Foundation 02 pra `Payable`).
 *
 * `valor`/`percentual`/`baseCalculo` são SEMPRE informados por um humano
 * ao criar a comissão — esta função nunca calcula/infere um valor de
 * comissão sozinha (nenhuma regra tipo "10% de toda venda" existe ou é
 * aplicada automaticamente).
 *
 * Pagamento de comissão (mover pra `PAGA`) sempre passa por Gate FINANCEIRO
 * — "alteração sensível de comissão pode exigir Gate" (§21) — mesmo padrão
 * de estorno de Payment, com a mesma idempotência real (reconfirmar um
 * Gate já consumido não paga a comissão de novo).
 */

const TRANSICOES_VALIDAS: Record<CommissionStatus, CommissionStatus[]> = {
  PREVISTA: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["PAGA", "CANCELADA"],
  PAGA: [],
  CANCELADA: [],
};

export function transicaoValidaCommission(de: CommissionStatus, para: CommissionStatus): boolean {
  return TRANSICOES_VALIDAS[de]?.includes(para) ?? false;
}

export interface CriarComissaoParams {
  tenantId: string;
  bookingId: string;
  // Exatamente um dos dois (§7C do comando) — garantido também por CHECK
  // constraint no banco (não só por esta validação de aplicação).
  beneficiarioId?: string | null;
  partnerId?: string | null;
  valor: number;
  moeda: string;
  percentual?: number | null;
  baseCalculo?: number | null;
  criadoPorId?: string | null;
  idempotencyKey?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type CriarComissaoResultado =
  | { ok: true; commission: Commission; criada: boolean }
  | { ok: false; motivo: "BOOKING_NAO_ENCONTRADO" | "BENEFICIARIO_NAO_E_MEMBRO_DO_TENANT" | "PARTNER_NAO_ENCONTRADO" | "PARTNER_INATIVO" | "BENEFICIARIO_INVALIDO" };

export async function criarComissao(prisma: PrismaClient, params: CriarComissaoParams): Promise<CriarComissaoResultado> {
  const temBeneficiario = !!params.beneficiarioId;
  const temPartner = !!params.partnerId;
  if (temBeneficiario === temPartner) return { ok: false, motivo: "BENEFICIARIO_INVALIDO" }; // nem os dois, nem nenhum

  return withTenant(prisma, params.tenantId, async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: params.bookingId } });
    if (!booking) return { ok: false, motivo: "BOOKING_NAO_ENCONTRADO" };

    // PM-CONV-08 — achado real: mesma proteção que Payment/CostEvent já
    // tinham, faltando aqui — duplo clique/retry de rede não deve criar
    // duas Commission pro mesmo evento de negócio.
    if (params.idempotencyKey) {
      const existente = await tx.commission.findUnique({ where: { tenantId_idempotencyKey: { tenantId: params.tenantId, idempotencyKey: params.idempotencyKey } } });
      if (existente) return { ok: true, commission: existente, criada: false };
    }

    if (temBeneficiario) {
      const membro = await tx.membership.findFirst({ where: { tenantId: params.tenantId, userId: params.beneficiarioId! } });
      if (!membro) return { ok: false, motivo: "BENEFICIARIO_NAO_E_MEMBRO_DO_TENANT" };
    } else {
      const partner = await tx.partner.findUnique({ where: { id: params.partnerId! } });
      if (!partner) return { ok: false, motivo: "PARTNER_NAO_ENCONTRADO" };
      if (!partner.ativo) return { ok: false, motivo: "PARTNER_INATIVO" };
    }

    const commission = await tx.commission.create({
      data: {
        tenantId: params.tenantId,
        bookingId: booking.id,
        beneficiarioId: temBeneficiario ? params.beneficiarioId : null,
        partnerId: temPartner ? params.partnerId : null,
        valor: params.valor,
        moeda: params.moeda,
        percentual: params.percentual ?? null,
        baseCalculo: params.baseCalculo ?? null,
        criadoPorId: params.criadoPorId ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "COMISSAO_CRIADA",
      entidade: "Commission",
      entidadeId: commission.id,
      resultado: "ok",
      detalhe: { bookingId: booking.id, beneficiarioId: params.beneficiarioId ?? null, partnerId: params.partnerId ?? null, valor: params.valor },
    });
    return { ok: true, commission, criada: true };
  });
}

export async function confirmarComissao(prisma: PrismaClient, params: { tenantId: string; commissionId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null }): Promise<{ ok: true; commission: Commission } | { ok: false; motivo: "NAO_ENCONTRADA" | "TRANSICAO_INVALIDA" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.commission.findUnique({ where: { id: params.commissionId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (!transicaoValidaCommission(atual.status, "CONFIRMADA")) return { ok: false, motivo: "TRANSICAO_INVALIDA" };

    const commission = await tx.commission.update({ where: { id: atual.id }, data: { status: "CONFIRMADA" } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "COMISSAO_CONFIRMADA",
      entidade: "Commission",
      entidadeId: commission.id,
      resultado: "ok",
      detalhe: {},
    });
    return { ok: true, commission };
  });
}

export async function cancelarComissao(prisma: PrismaClient, params: { tenantId: string; commissionId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null }): Promise<{ ok: true; commission: Commission } | { ok: false; motivo: "NAO_ENCONTRADA" | "TRANSICAO_INVALIDA" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.commission.findUnique({ where: { id: params.commissionId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (!transicaoValidaCommission(atual.status, "CANCELADA")) return { ok: false, motivo: "TRANSICAO_INVALIDA" };

    const commission = await tx.commission.update({ where: { id: atual.id }, data: { status: "CANCELADA" } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "COMISSAO_CANCELADA",
      entidade: "Commission",
      entidadeId: commission.id,
      resultado: "ok",
      detalhe: {},
    });
    return { ok: true, commission };
  });
}

// ---------------------------------------------------------------------------
// Pagamento da comissão — sempre via Gate FINANCEIRO (§21).
// ---------------------------------------------------------------------------

export interface SolicitarPagamentoComissaoParams {
  tenantId: string;
  commissionId: string;
  motivo: string;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type SolicitarPagamentoResultado = { ok: true; gateId: string } | { ok: false; motivo: "NAO_ENCONTRADA" | "STATUS_NAO_PERMITE_PAGAMENTO" };

export async function solicitarPagamentoComissao(prisma: PrismaClient, params: SolicitarPagamentoComissaoParams): Promise<SolicitarPagamentoResultado> {
  const atual = await withTenant(prisma, params.tenantId, (tx) => tx.commission.findUnique({ where: { id: params.commissionId } }));
  if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
  if (atual.status !== "CONFIRMADA") return { ok: false, motivo: "STATUS_NAO_PERMITE_PAGAMENTO" };

  return withTenant(prisma, params.tenantId, async (tx) => {
    const gate = await criarGate(prisma, {
      tenantId: params.tenantId,
      categoria: "FINANCEIRO",
      acaoProposta: `Pagar comissão de ${atual.moeda} ${atual.valor} (comissão ${atual.id})`,
      motivo: params.motivo,
      solicitanteTipo: params.actorType,
      solicitanteId: params.actorType === "HUMANO" ? (params.userId ?? undefined) : undefined,
      solicitanteLabel: params.actorType !== "HUMANO" ? (params.actorLabel ?? undefined) : undefined,
      metadata: { commissionId: atual.id },
      subjectFingerprint: fingerprintDaComissao(atual),
    });
    await tx.commission.update({ where: { id: atual.id }, data: { gateId: gate.id } });
    return { ok: true as const, gateId: gate.id };
  });
}

export type ConfirmarPagamentoResultado =
  | { ok: true; status: "PAGA"; commission: Commission; jaAplicado: boolean }
  | { ok: true; status: "GATE_PENDENTE" }
  | { ok: true; status: "GATE_NEGADO" }
  | { ok: true; status: "DADOS_ALTERADOS_APOS_APROVACAO" }
  | { ok: false; motivo: "NAO_ENCONTRADA" | "SEM_GATE_ASSOCIADO" };

/**
 * Idempotente de verdade (mesmo padrão de `confirmarEstornoAposAprovacaoGate`):
 * reconfirmar um Gate já consumido nunca paga a comissão duas vezes.
 *
 * PM-CONV-04, §8C: também verifica o fingerprint do Gate contra o estado
 * ATUAL da comissão antes de pagar — se valor/moeda/percentual/baseCalculo
 * mudaram entre a aprovação do Gate e esta confirmação, a aprovação
 * anterior NÃO vale mais silenciosamente (`DADOS_ALTERADOS_APOS_APROVACAO`),
 * mesmo com o Gate formalmente `APROVADO`.
 */
export async function confirmarPagamentoComissaoAposGate(prisma: PrismaClient, params: { tenantId: string; commissionId: string }): Promise<ConfirmarPagamentoResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.commission.findUnique({ where: { id: params.commissionId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (!atual.gateId) return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };

    const gate = await tx.gate.findUnique({ where: { id: atual.gateId } });
    if (!gate) return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };
    if (gate.status === "PENDENTE") return { ok: true, status: "GATE_PENDENTE" };
    if (gate.status !== "APROVADO") return { ok: true, status: "GATE_NEGADO" };

    if (atual.status !== "PAGA" && !fingerprintCompativel(gate, camposFingerprintComissao(atual))) {
      await registrarEvento(tx, {
        tenantId: params.tenantId,
        actorType: "SISTEMA",
        acao: "COMISSAO_PAGAMENTO_RECUSADO_FINGERPRINT",
        entidade: "Commission",
        entidadeId: atual.id,
        resultado: "recusado",
        detalhe: { gateId: gate.id },
      });
      return { ok: true, status: "DADOS_ALTERADOS_APOS_APROVACAO" };
    }

    if (atual.status === "PAGA") {
      return { ok: true, status: "PAGA", commission: atual, jaAplicado: true };
    }
    if (!transicaoValidaCommission(atual.status, "PAGA")) return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };

    const commission = await tx.commission.update({ where: { id: atual.id }, data: { status: "PAGA", pagaEm: new Date() } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: "SISTEMA",
      acao: "COMISSAO_PAGA",
      entidade: "Commission",
      entidadeId: commission.id,
      resultado: "ok",
      detalhe: { gateId: gate.id },
    });
    return { ok: true, status: "PAGA", commission, jaAplicado: false };
  });
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export async function listarComissoesDoBooking(prisma: PrismaClient, tenantId: string, bookingId: string): Promise<Commission[]> {
  return withTenant(prisma, tenantId, (tx) => tx.commission.findMany({ where: { tenantId, bookingId }, orderBy: { createdAt: "desc" } }));
}

export async function listarComissoesPendentes(prisma: PrismaClient, tenantId: string): Promise<Commission[]> {
  return withTenant(prisma, tenantId, (tx) => tx.commission.findMany({ where: { tenantId, status: { in: ["PREVISTA", "CONFIRMADA"] } }, orderBy: { createdAt: "asc" } }));
}
