import type { PrismaClient, RewardCampaign, RewardClaim, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";
import { criarGate, calcularFingerprint, fingerprintCompativel } from "./gates";

/**
 * PM-CONV-04, Track C, §10C — Premiação por meta de vendas. DISTINTA de
 * Commission por semântica real: Commission é por VENDA individual;
 * RewardClaim é por META atingida numa janela de campanha. Pagamento
 * sempre via Gate FINANCEIRO com o mesmo fingerprint usado em Commission
 * (§8C) — nunca um segundo motor de pagamento.
 */

function camposFingerprintClaim(c: { valor: number; moeda: string }): Record<string, unknown> {
  return { valor: c.valor, moeda: c.moeda };
}

export interface CriarRewardCampaignParams {
  tenantId: string;
  nome: string;
  meta: number;
  valor: number;
  moeda: string;
  dataInicio: Date;
  dataFim: Date;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type CriarRewardCampaignResultado = { ok: true; campanha: RewardCampaign } | { ok: false; motivo: "META_INVALIDA" | "DATA_INVALIDA" };

export async function criarRewardCampaign(prisma: PrismaClient, params: CriarRewardCampaignParams): Promise<CriarRewardCampaignResultado> {
  if (!Number.isInteger(params.meta) || params.meta < 1) return { ok: false, motivo: "META_INVALIDA" };
  if (params.dataFim < params.dataInicio) return { ok: false, motivo: "DATA_INVALIDA" };

  return withTenant(prisma, params.tenantId, async (tx) => {
    const campanha = await tx.rewardCampaign.create({
      data: { tenantId: params.tenantId, nome: params.nome, meta: params.meta, valor: params.valor, moeda: params.moeda, dataInicio: params.dataInicio, dataFim: params.dataFim },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "REWARD_CAMPAIGN_CRIADA",
      entidade: "RewardCampaign",
      entidadeId: campanha.id,
      resultado: "ok",
      detalhe: { nome: campanha.nome, meta: campanha.meta },
    });
    return { ok: true, campanha };
  });
}

export async function listarRewardCampaigns(prisma: PrismaClient, tenantId: string, params?: { somenteAtivas?: boolean }) {
  return withTenant(prisma, tenantId, (tx) => tx.rewardCampaign.findMany({ where: { tenantId, ...(params?.somenteAtivas ? { ativo: true } : {}) }, orderBy: { dataInicio: "desc" } }));
}

// ---------------------------------------------------------------------------
// Solicitação — verifica a meta contra Commission PAGA/CONFIRMADA do
// parceiro dentro da janela da campanha (nunca calcula sozinha, só CONTA).
// ---------------------------------------------------------------------------

export type SolicitarRewardResultado =
  | { ok: true; claim: RewardClaim; jaExistia: boolean }
  | { ok: false; motivo: "CAMPANHA_NAO_ENCONTRADA" | "CAMPANHA_INATIVA" | "PARTNER_NAO_ENCONTRADO" | "META_NAO_ATINGIDA" };

export async function solicitarReward(prisma: PrismaClient, params: { tenantId: string; campaignId: string; partnerId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null }): Promise<SolicitarRewardResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const campanha = await tx.rewardCampaign.findUnique({ where: { id: params.campaignId } });
    if (!campanha) return { ok: false, motivo: "CAMPANHA_NAO_ENCONTRADA" };
    if (!campanha.ativo) return { ok: false, motivo: "CAMPANHA_INATIVA" };
    const partner = await tx.partner.findUnique({ where: { id: params.partnerId } });
    if (!partner) return { ok: false, motivo: "PARTNER_NAO_ENCONTRADO" };

    const existente = await tx.rewardClaim.findUnique({ where: { tenantId_campaignId_partnerId: { tenantId: params.tenantId, campaignId: campanha.id, partnerId: partner.id } } });
    if (existente) return { ok: true, claim: existente, jaExistia: true };

    const vendas = await tx.commission.count({
      where: { tenantId: params.tenantId, partnerId: partner.id, status: { in: ["CONFIRMADA", "PAGA"] }, createdAt: { gte: campanha.dataInicio, lte: campanha.dataFim } },
    });
    if (vendas < campanha.meta) return { ok: false, motivo: "META_NAO_ATINGIDA" };

    const claim = await tx.rewardClaim.create({ data: { tenantId: params.tenantId, campaignId: campanha.id, partnerId: partner.id } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "REWARD_CLAIM_SOLICITADA",
      entidade: "RewardClaim",
      entidadeId: claim.id,
      resultado: "ok",
      detalhe: { campaignId: campanha.id, partnerId: partner.id, vendasNaJanela: vendas },
    });
    return { ok: true, claim, jaExistia: false };
  });
}

export type AprovarRewardResultado = { ok: true; claim: RewardClaim } | { ok: false; motivo: "NAO_ENCONTRADA" | "STATUS_NAO_PERMITE" };

export async function aprovarReward(prisma: PrismaClient, params: { tenantId: string; claimId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null }): Promise<AprovarRewardResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.rewardClaim.findUnique({ where: { id: params.claimId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (atual.status !== "SOLICITADA") return { ok: false, motivo: "STATUS_NAO_PERMITE" };
    const claim = await tx.rewardClaim.update({ where: { id: atual.id }, data: { status: "APROVADA" } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "REWARD_CLAIM_APROVADA",
      entidade: "RewardClaim",
      entidadeId: claim.id,
      resultado: "ok",
    });
    return { ok: true, claim };
  });
}

// ---------------------------------------------------------------------------
// Pagamento — via Gate FINANCEIRO, com fingerprint (§8C, mesma lógica de Commission).
// ---------------------------------------------------------------------------

export type SolicitarPagamentoRewardResultado = { ok: true; gateId: string } | { ok: false; motivo: "NAO_ENCONTRADA" | "STATUS_NAO_PERMITE_PAGAMENTO" };

export async function solicitarPagamentoReward(prisma: PrismaClient, params: { tenantId: string; claimId: string; motivo: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null }): Promise<SolicitarPagamentoRewardResultado> {
  const atual = await withTenant(prisma, params.tenantId, (tx) => tx.rewardClaim.findUnique({ where: { id: params.claimId }, include: { campaign: true } }));
  if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
  if (atual.status !== "APROVADA") return { ok: false, motivo: "STATUS_NAO_PERMITE_PAGAMENTO" };

  return withTenant(prisma, params.tenantId, async (tx) => {
    const gate = await criarGate(prisma, {
      tenantId: params.tenantId,
      categoria: "FINANCEIRO",
      acaoProposta: `Pagar premiação de ${atual.campaign.moeda} ${atual.campaign.valor} (campanha "${atual.campaign.nome}")`,
      motivo: params.motivo,
      solicitanteTipo: params.actorType,
      solicitanteId: params.actorType === "HUMANO" ? (params.userId ?? undefined) : undefined,
      solicitanteLabel: params.actorType !== "HUMANO" ? (params.actorLabel ?? undefined) : undefined,
      metadata: { rewardClaimId: atual.id },
      subjectFingerprint: calcularFingerprint(camposFingerprintClaim(atual.campaign)),
    });
    await tx.rewardClaim.update({ where: { id: atual.id }, data: { gateId: gate.id } });
    return { ok: true as const, gateId: gate.id };
  });
}

export type ConfirmarPagamentoRewardResultado =
  | { ok: true; status: "PAGA"; claim: RewardClaim; jaAplicado: boolean }
  | { ok: true; status: "GATE_PENDENTE" }
  | { ok: true; status: "GATE_NEGADO" }
  | { ok: true; status: "DADOS_ALTERADOS_APOS_APROVACAO" }
  | { ok: false; motivo: "NAO_ENCONTRADA" | "SEM_GATE_ASSOCIADO" };

export async function confirmarPagamentoRewardAposGate(prisma: PrismaClient, params: { tenantId: string; claimId: string }): Promise<ConfirmarPagamentoRewardResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.rewardClaim.findUnique({ where: { id: params.claimId }, include: { campaign: true } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (!atual.gateId) return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };

    const gate = await tx.gate.findUnique({ where: { id: atual.gateId } });
    if (!gate) return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };
    if (gate.status === "PENDENTE") return { ok: true, status: "GATE_PENDENTE" };
    if (gate.status !== "APROVADO") return { ok: true, status: "GATE_NEGADO" };

    if (atual.status === "PAGA") return { ok: true, status: "PAGA", claim: atual, jaAplicado: true };

    if (!fingerprintCompativel(gate, camposFingerprintClaim(atual.campaign))) {
      await registrarEvento(tx, {
        tenantId: params.tenantId,
        actorType: "SISTEMA",
        acao: "REWARD_CLAIM_PAGAMENTO_RECUSADO_FINGERPRINT",
        entidade: "RewardClaim",
        entidadeId: atual.id,
        resultado: "recusado",
        detalhe: { gateId: gate.id },
      });
      return { ok: true, status: "DADOS_ALTERADOS_APOS_APROVACAO" };
    }
    if (atual.status !== "APROVADA") return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };

    const claim = await tx.rewardClaim.update({ where: { id: atual.id }, data: { status: "PAGA", pagaEm: new Date() } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: "SISTEMA",
      acao: "REWARD_CLAIM_PAGA",
      entidade: "RewardClaim",
      entidadeId: claim.id,
      resultado: "ok",
      detalhe: { gateId: gate.id },
    });
    return { ok: true, status: "PAGA", claim, jaAplicado: false };
  });
}
