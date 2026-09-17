import type { PrismaClient, Partner, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-04, Track C — Partner (pessoa/empresa externa que indica
 * clientes). Reaproveita a IDEIA de "partnerCode" encontrada na auditoria
 * da entrega Valter 0.4.11 (PM_CONV_02_INVENTARIO.md, Grupo 3 item 4:
 * "painel de resumo do parceiro"), nunca o código PHP em si.
 */

export interface CriarPartnerParams {
  tenantId: string;
  nome: string;
  codigo: string;
  tipo?: string | null;
  contato?: string | null;
  email?: string | null;
  origem?: string | null;
  observacoes?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type CriarPartnerResultado = { ok: true; partner: Partner } | { ok: false; motivo: "CODIGO_JA_EXISTE" };

export async function criarPartner(prisma: PrismaClient, params: CriarPartnerParams): Promise<CriarPartnerResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const existente = await tx.partner.findUnique({ where: { tenantId_codigo: { tenantId: params.tenantId, codigo: params.codigo } } });
    if (existente) return { ok: false, motivo: "CODIGO_JA_EXISTE" };

    const partner = await tx.partner.create({
      data: {
        tenantId: params.tenantId,
        nome: params.nome,
        codigo: params.codigo,
        tipo: params.tipo ?? null,
        contato: params.contato ?? null,
        email: params.email ?? null,
        origem: params.origem ?? null,
        observacoes: params.observacoes ?? null,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "PARTNER_CRIADO",
      entidade: "Partner",
      entidadeId: partner.id,
      resultado: "ok",
      detalhe: { nome: partner.nome, codigo: partner.codigo },
    });
    return { ok: true, partner };
  });
}

export interface EditarPartnerParams {
  tenantId: string;
  partnerId: string;
  nome?: string;
  tipo?: string | null;
  contato?: string | null;
  email?: string | null;
  ativo?: boolean;
  observacoes?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function editarPartner(prisma: PrismaClient, params: EditarPartnerParams): Promise<{ ok: true; partner: Partner } | { ok: false; motivo: "NAO_ENCONTRADO" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.partner.findUnique({ where: { id: params.partnerId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };

    const partner = await tx.partner.update({
      where: { id: atual.id },
      data: {
        ...(params.nome !== undefined ? { nome: params.nome } : {}),
        ...(params.tipo !== undefined ? { tipo: params.tipo } : {}),
        ...(params.contato !== undefined ? { contato: params.contato } : {}),
        ...(params.email !== undefined ? { email: params.email } : {}),
        ...(params.ativo !== undefined ? { ativo: params.ativo } : {}),
        ...(params.observacoes !== undefined ? { observacoes: params.observacoes } : {}),
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "PARTNER_ALTERADO",
      entidade: "Partner",
      entidadeId: partner.id,
      resultado: "ok",
      detalhe: { ativo: partner.ativo },
    });
    return { ok: true, partner };
  });
}

export async function listarPartners(prisma: PrismaClient, tenantId: string, params?: { somenteAtivos?: boolean }) {
  return withTenant(prisma, tenantId, (tx) => tx.partner.findMany({ where: { tenantId, ...(params?.somenteAtivos ? { ativo: true } : {}) }, orderBy: { nome: "asc" } }));
}

export async function buscarPartner(prisma: PrismaClient, tenantId: string, partnerId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.partner.findUnique({
      where: { id: partnerId },
      include: { comissoes: { orderBy: { createdAt: "desc" } }, indicacoes: { include: { lead: true } }, rewardClaims: { include: { campaign: true } } },
    }),
  );
}

// ---------------------------------------------------------------------------
// Indicação (referral) — DISTINTA de Attribution (T6, marketing). Um Lead só
// pode ter UMA origem de indicação de parceiro (§6C do comando).
// ---------------------------------------------------------------------------

export type RegistrarIndicacaoResultado = { ok: true } | { ok: false; motivo: "PARTNER_NAO_ENCONTRADO" | "PARTNER_INATIVO" | "LEAD_NAO_ENCONTRADO" | "LEAD_JA_TEM_INDICACAO" };

export async function registrarIndicacao(
  prisma: PrismaClient,
  params: { tenantId: string; partnerId: string; leadId: string; actorType?: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<RegistrarIndicacaoResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const partner = await tx.partner.findUnique({ where: { id: params.partnerId } });
    if (!partner) return { ok: false, motivo: "PARTNER_NAO_ENCONTRADO" };
    if (!partner.ativo) return { ok: false, motivo: "PARTNER_INATIVO" };
    const lead = await tx.lead.findUnique({ where: { id: params.leadId } });
    if (!lead) return { ok: false, motivo: "LEAD_NAO_ENCONTRADO" };

    const existente = await tx.partnerReferral.findUnique({ where: { tenantId_leadId: { tenantId: params.tenantId, leadId: params.leadId } } });
    if (existente) return { ok: false, motivo: "LEAD_JA_TEM_INDICACAO" };

    const referral = await tx.partnerReferral.create({ data: { tenantId: params.tenantId, partnerId: partner.id, leadId: lead.id } });
    const actorType = params.actorType ?? "SISTEMA";
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType,
      userId: actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "PARTNER_INDICACAO_REGISTRADA",
      entidade: "PartnerReferral",
      entidadeId: referral.id,
      resultado: "ok",
      detalhe: { partnerId: partner.id, leadId: lead.id },
    });
    return { ok: true };
  });
}
