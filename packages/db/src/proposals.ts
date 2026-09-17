import type { PrismaClient, Proposal, ActorType, Prisma } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";
import { criarGate } from "./gates";
import { avaliarPoliticaComercial } from "./crm/proposta-politica";
import { obterLimitesComerciais } from "./commercial-policy";
import type { ExchangeRateQuote } from "./finance/types";

/**
 * Proposal Foundation 01 (PM-NIGHT-RUN-01, Etapa 5) — motor de proposta
 * comercial. Princípios da autorização aplicados estruturalmente, não só
 * documentados:
 *
 * - **Versionamento obrigatório** (§33): uma proposta `RASCUNHO` pode ser
 *   editada in-place (`atualizarPropostaRascunho`); qualquer alteração
 *   depois de `ENVIADA` passa por `criarNovaVersao` — cria uma linha NOVA
 *   (nunca reescreve a antiga), marca a anterior `SUBSTITUIDA`. Preço/
 *   moeda/validade/cotação de uma proposta já enviada nunca mudam depois —
 *   não existe função de update para status != RASCUNHO.
 * - **Yalla pode preparar/recomendar, nunca autoaprovar** (§34):
 *   `enviarProposta` avalia a política comercial (`proposta-politica.ts`)
 *   e, se exigir aprovação, cria um `Gate` categoria `COMERCIAL` e BLOQUEIA
 *   o envio (`AGUARDANDO_APROVACAO`) — só uma decisão humana real via
 *   `decidirGate` (T1, `decisorId` sempre um User de verdade) libera o
 *   envio de fato, através de `confirmarEnvioAposAprovacaoGate`.
 */

export interface CriarPropostaParams {
  tenantId: string;
  leadId: string;
  criadoPorId?: string | null;
  roteiro?: string | null;
  datasViagem?: unknown;
  quantidadePassageiros?: number | null;
  servicosIncluidos?: string[] | null;
  servicosExcluidos?: string[] | null;
  moeda: string;
  preco: number;
  precoReferencia?: number | null;
  custos?: number | null;
  condicoes?: string | null;
  validade: Date;
  condicaoExcepcional?: boolean;
  compromissoExternoSensivel?: boolean;
}

function jsonOrNull(v: unknown): Prisma.InputJsonValue | undefined {
  return v === undefined || v === null ? undefined : (v as Prisma.InputJsonValue);
}

export async function criarProposta(prisma: PrismaClient, params: CriarPropostaParams): Promise<Proposal> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const proposta = await tx.proposal.create({
      data: {
        tenantId: params.tenantId,
        leadId: params.leadId,
        criadoPorId: params.criadoPorId ?? null,
        status: "RASCUNHO",
        versao: 1,
        roteiro: params.roteiro ?? null,
        datasViagem: jsonOrNull(params.datasViagem),
        quantidadePassageiros: params.quantidadePassageiros ?? null,
        servicosIncluidos: jsonOrNull(params.servicosIncluidos),
        servicosExcluidos: jsonOrNull(params.servicosExcluidos),
        moeda: params.moeda,
        preco: params.preco,
        precoReferencia: params.precoReferencia ?? null,
        custos: params.custos ?? null,
        condicoes: params.condicoes ?? null,
        validade: params.validade,
        condicaoExcepcional: params.condicaoExcepcional ?? false,
        compromissoExternoSensivel: params.compromissoExternoSensivel ?? false,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: "HUMANO",
      userId: params.criadoPorId ?? null,
      acao: "PROPOSTA_CRIADA",
      entidade: "Proposal",
      entidadeId: proposta.id,
      resultado: "ok",
      detalhe: { leadId: params.leadId, versao: 1 },
    });
    return proposta;
  });
}

export type AtualizarPropostaDados = Partial<Omit<CriarPropostaParams, "tenantId" | "leadId" | "criadoPorId">>;

/** Edita uma proposta EM RASCUNHO, in-place. Qualquer outro status: use `criarNovaVersao`. */
export async function atualizarPropostaRascunho(
  prisma: PrismaClient,
  params: { tenantId: string; propostaId: string; dados: AtualizarPropostaDados },
): Promise<{ ok: true; proposta: Proposal } | { ok: false; motivo: "NAO_ENCONTRADA" | "NAO_E_RASCUNHO" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.proposal.findUnique({ where: { id: params.propostaId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (atual.status !== "RASCUNHO") return { ok: false, motivo: "NAO_E_RASCUNHO" };

    const d = params.dados;
    const proposta = await tx.proposal.update({
      where: { id: params.propostaId },
      data: {
        ...(d.roteiro !== undefined ? { roteiro: d.roteiro } : {}),
        ...(d.datasViagem !== undefined ? { datasViagem: jsonOrNull(d.datasViagem) } : {}),
        ...(d.quantidadePassageiros !== undefined ? { quantidadePassageiros: d.quantidadePassageiros } : {}),
        ...(d.servicosIncluidos !== undefined ? { servicosIncluidos: jsonOrNull(d.servicosIncluidos) } : {}),
        ...(d.servicosExcluidos !== undefined ? { servicosExcluidos: jsonOrNull(d.servicosExcluidos) } : {}),
        ...(d.moeda !== undefined ? { moeda: d.moeda } : {}),
        ...(d.preco !== undefined ? { preco: d.preco } : {}),
        ...(d.precoReferencia !== undefined ? { precoReferencia: d.precoReferencia } : {}),
        ...(d.custos !== undefined ? { custos: d.custos } : {}),
        ...(d.condicoes !== undefined ? { condicoes: d.condicoes } : {}),
        ...(d.validade !== undefined ? { validade: d.validade } : {}),
        ...(d.condicaoExcepcional !== undefined ? { condicaoExcepcional: d.condicaoExcepcional } : {}),
        ...(d.compromissoExternoSensivel !== undefined ? { compromissoExternoSensivel: d.compromissoExternoSensivel } : {}),
      },
    });
    return { ok: true, proposta };
  });
}

/** Cria uma NOVA versão a partir de uma proposta que já saiu de RASCUNHO — a anterior vira SUBSTITUIDA, nunca é reescrita. */
export async function criarNovaVersao(
  prisma: PrismaClient,
  params: { tenantId: string; propostaAnteriorId: string; criadoPorId?: string | null; dados: AtualizarPropostaDados },
): Promise<{ ok: true; proposta: Proposal } | { ok: false; motivo: "NAO_ENCONTRADA" | "AINDA_E_RASCUNHO" | "JA_SUBSTITUIDA" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const anterior = await tx.proposal.findUnique({ where: { id: params.propostaAnteriorId } });
    if (!anterior) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (anterior.status === "RASCUNHO") return { ok: false, motivo: "AINDA_E_RASCUNHO" }; // rascunho edita in-place, não versiona
    if (anterior.status === "SUBSTITUIDA") return { ok: false, motivo: "JA_SUBSTITUIDA" };

    const d = params.dados;
    const nova = await tx.proposal.create({
      data: {
        tenantId: params.tenantId,
        leadId: anterior.leadId,
        criadoPorId: params.criadoPorId ?? anterior.criadoPorId,
        status: "RASCUNHO",
        versao: anterior.versao + 1,
        substituiPropostaId: anterior.id,
        roteiro: d.roteiro !== undefined ? d.roteiro : anterior.roteiro,
        datasViagem: d.datasViagem !== undefined ? jsonOrNull(d.datasViagem) : (anterior.datasViagem ?? undefined),
        quantidadePassageiros: d.quantidadePassageiros !== undefined ? d.quantidadePassageiros : anterior.quantidadePassageiros,
        servicosIncluidos: d.servicosIncluidos !== undefined ? jsonOrNull(d.servicosIncluidos) : (anterior.servicosIncluidos ?? undefined),
        servicosExcluidos: d.servicosExcluidos !== undefined ? jsonOrNull(d.servicosExcluidos) : (anterior.servicosExcluidos ?? undefined),
        moeda: d.moeda !== undefined ? d.moeda : anterior.moeda,
        preco: d.preco !== undefined ? d.preco : anterior.preco,
        precoReferencia: d.precoReferencia !== undefined ? d.precoReferencia : anterior.precoReferencia,
        custos: d.custos !== undefined ? d.custos : anterior.custos,
        condicoes: d.condicoes !== undefined ? d.condicoes : anterior.condicoes,
        validade: d.validade !== undefined ? d.validade : anterior.validade,
        condicaoExcepcional: d.condicaoExcepcional ?? anterior.condicaoExcepcional,
        compromissoExternoSensivel: d.compromissoExternoSensivel ?? anterior.compromissoExternoSensivel,
      },
    });
    await tx.proposal.update({ where: { id: anterior.id }, data: { status: "SUBSTITUIDA" } });

    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: "HUMANO",
      userId: params.criadoPorId ?? null,
      acao: "PROPOSTA_NOVA_VERSAO",
      entidade: "Proposal",
      entidadeId: nova.id,
      resultado: "ok",
      detalhe: { propostaAnteriorId: anterior.id, versao: nova.versao },
    });
    return { ok: true, proposta: nova };
  });
}

export interface EnviarPropostaParams {
  tenantId: string;
  propostaId: string;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
  cotacaoCambio?: ExchangeRateQuote | null;
}

export type EnviarPropostaResultado =
  | { ok: true; status: "ENVIADA"; proposta: Proposal }
  | { ok: true; status: "AGUARDANDO_APROVACAO"; proposta: Proposal; gateId: string; motivos: string[] }
  | { ok: false; motivo: "NAO_ENCONTRADA" | "NAO_E_RASCUNHO" };

/** Avalia a política comercial e envia (ou bloqueia via Gate COMERCIAL) — nunca decide sozinha que está tudo bem quando a política exige aprovação. */
export async function enviarProposta(prisma: PrismaClient, params: EnviarPropostaParams): Promise<EnviarPropostaResultado> {
  const atual = await withTenant(prisma, params.tenantId, (tx) => tx.proposal.findUnique({ where: { id: params.propostaId } }));
  if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
  if (atual.status !== "RASCUNHO") return { ok: false, motivo: "NAO_E_RASCUNHO" };

  const anterior = atual.substituiPropostaId
    ? await withTenant(prisma, params.tenantId, (tx) => tx.proposal.findUnique({ where: { id: atual.substituiPropostaId! } }))
    : null;

  const limites = await obterLimitesComerciais(prisma, params.tenantId);
  const politica = avaliarPoliticaComercial(
    {
      preco: atual.preco,
      precoReferencia: atual.precoReferencia,
      custos: atual.custos,
      precoVersaoAnterior: anterior?.preco ?? null,
      condicaoExcepcional: atual.condicaoExcepcional,
      compromissoExternoSensivel: atual.compromissoExternoSensivel,
    },
    limites,
  );

  if (politica.exigeGate) {
    return withTenant(prisma, params.tenantId, async (tx) => {
      const gate = await criarGate(prisma, {
        tenantId: params.tenantId,
        categoria: "COMERCIAL",
        acaoProposta: `Enviar proposta (v${atual.versao}) ao lead — ${atual.moeda} ${atual.preco}`,
        motivo: politica.motivos.map((m) => m.motivo).join("; "),
        solicitanteTipo: params.actorType,
        solicitanteId: params.actorType === "HUMANO" ? (params.userId ?? undefined) : undefined,
        solicitanteLabel: params.actorType !== "HUMANO" ? (params.actorLabel ?? undefined) : undefined,
        metadata: { propostaId: atual.id, fatores: politica.motivos.map((m) => m.fator) },
      });
      const proposta = await tx.proposal.update({ where: { id: atual.id }, data: { status: "AGUARDANDO_APROVACAO", gateId: gate.id } });
      return { ok: true as const, status: "AGUARDANDO_APROVACAO" as const, proposta, gateId: gate.id, motivos: politica.motivos.map((m) => m.motivo) };
    });
  }

  return withTenant(prisma, params.tenantId, async (tx) => {
    const proposta = await tx.proposal.update({
      where: { id: atual.id },
      data: { status: "ENVIADA", enviadaEm: new Date(), cotacaoCambio: jsonOrNull(params.cotacaoCambio) },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "PROPOSTA_ENVIADA",
      entidade: "Proposal",
      entidadeId: proposta.id,
      resultado: "ok",
      detalhe: { versao: proposta.versao, viaGate: false },
    });
    return { ok: true as const, status: "ENVIADA" as const, proposta };
  });
}

export type ConfirmarEnvioResultado =
  | { ok: true; status: "ENVIADA"; proposta: Proposal }
  | { ok: true; status: "RASCUNHO"; proposta: Proposal; motivo: "GATE_REJEITADO" | "GATE_EXPIRADO" }
  | { ok: true; status: "AGUARDANDO_APROVACAO"; motivo: "GATE_AINDA_PENDENTE" }
  | { ok: false; motivo: "NAO_ENCONTRADA" | "SEM_GATE_ASSOCIADO" };

/** Rechecagem humana pós-decisão do Gate (T1 não resolve Jobs/Proposals sozinho — mesmo padrão de `reenviarJobManualmente`). Aprovado → envia de fato; rejeitado/expirado → volta pra RASCUNHO, editável de novo. */
export async function confirmarEnvioAposAprovacaoGate(prisma: PrismaClient, params: { tenantId: string; propostaId: string }): Promise<ConfirmarEnvioResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.proposal.findUnique({ where: { id: params.propostaId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (!atual.gateId) return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };

    const gate = await tx.gate.findUnique({ where: { id: atual.gateId } });
    if (!gate) return { ok: false, motivo: "SEM_GATE_ASSOCIADO" };

    if (gate.status === "PENDENTE") return { ok: true, status: "AGUARDANDO_APROVACAO", motivo: "GATE_AINDA_PENDENTE" };

    if (gate.status === "APROVADO") {
      const proposta = await tx.proposal.update({ where: { id: atual.id }, data: { status: "ENVIADA", enviadaEm: new Date() } });
      await registrarEvento(tx, {
        tenantId: params.tenantId,
        actorType: "SISTEMA",
        acao: "PROPOSTA_ENVIADA",
        entidade: "Proposal",
        entidadeId: proposta.id,
        resultado: "ok",
        detalhe: { versao: proposta.versao, viaGate: true, gateId: gate.id },
      });
      return { ok: true, status: "ENVIADA", proposta };
    }

    // REJEITADO ou EXPIRADO — nunca "meio enviado": volta a ser editável.
    const proposta = await tx.proposal.update({ where: { id: atual.id }, data: { status: "RASCUNHO" } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: "SISTEMA",
      acao: "PROPOSTA_ENVIO_BLOQUEADO_POR_GATE",
      entidade: "Proposal",
      entidadeId: proposta.id,
      resultado: gate.status.toLowerCase(),
      detalhe: { gateId: gate.id },
    });
    return { ok: true, status: "RASCUNHO", proposta, motivo: gate.status === "REJEITADO" ? "GATE_REJEITADO" : "GATE_EXPIRADO" };
  });
}

export async function aceitarProposta(prisma: PrismaClient, params: { tenantId: string; propostaId: string }): Promise<{ ok: true; proposta: Proposal } | { ok: false; motivo: "NAO_ENCONTRADA" | "NAO_ESTA_ENVIADA" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.proposal.findUnique({ where: { id: params.propostaId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (atual.status !== "ENVIADA") return { ok: false, motivo: "NAO_ESTA_ENVIADA" };

    const proposta = await tx.proposal.update({ where: { id: atual.id }, data: { status: "ACEITA", aceitaEm: new Date() } });
    await registrarEvento(tx, { tenantId: params.tenantId, actorType: "HUMANO", acao: "PROPOSTA_ACEITA", entidade: "Proposal", entidadeId: proposta.id, resultado: "ok", detalhe: { versao: proposta.versao } });
    return { ok: true, proposta };
  });
}

export async function recusarProposta(prisma: PrismaClient, params: { tenantId: string; propostaId: string; motivo?: string | null }): Promise<{ ok: true; proposta: Proposal } | { ok: false; motivo: "NAO_ENCONTRADA" | "NAO_ESTA_ENVIADA" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.proposal.findUnique({ where: { id: params.propostaId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (atual.status !== "ENVIADA") return { ok: false, motivo: "NAO_ESTA_ENVIADA" };

    const motivoSeguro = params.motivo?.trim().replace(/<[^>]*>/g, "").slice(0, 500) || null;
    const proposta = await tx.proposal.update({ where: { id: atual.id }, data: { status: "RECUSADA", recusadaEm: new Date(), motivoRecusa: motivoSeguro } });
    await registrarEvento(tx, { tenantId: params.tenantId, actorType: "HUMANO", acao: "PROPOSTA_RECUSADA", entidade: "Proposal", entidadeId: proposta.id, resultado: "ok", detalhe: { versao: proposta.versao, motivo: motivoSeguro } });
    return { ok: true, proposta };
  });
}

/** Sweep preguiçoso (mesmo padrão de `expirarSeVencido` em gates.ts) — nenhum worker/cron dedicado. ENVIADA/AGUARDANDO_APROVACAO cuja validade passou vira EXPIRADA; RASCUNHO nunca expira sozinho (ainda não foi comprometido com o cliente). */
export async function expirarPropostasVencidas(prisma: PrismaClient, tenantId: string): Promise<void> {
  await withTenant(prisma, tenantId, async (tx) => {
    const vencidas = await tx.proposal.findMany({
      where: { tenantId, status: { in: ["ENVIADA", "AGUARDANDO_APROVACAO"] }, validade: { lt: new Date() } },
      select: { id: true, versao: true },
    });
    for (const p of vencidas) {
      const result = await tx.proposal.updateMany({ where: { id: p.id, tenantId, status: { in: ["ENVIADA", "AGUARDANDO_APROVACAO"] } }, data: { status: "EXPIRADA" } });
      if (result.count > 0) {
        await registrarEvento(tx, { tenantId, actorType: "SISTEMA", acao: "PROPOSTA_EXPIRADA", entidade: "Proposal", entidadeId: p.id, resultado: "expirada", detalhe: { versao: p.versao } });
      }
    }
  });
}

export async function listarPropostasDoLead(prisma: PrismaClient, tenantId: string, leadId: string): Promise<Proposal[]> {
  await expirarPropostasVencidas(prisma, tenantId);
  return withTenant(prisma, tenantId, (tx) => tx.proposal.findMany({ where: { tenantId, leadId }, orderBy: [{ versao: "desc" }, { createdAt: "desc" }] }));
}
