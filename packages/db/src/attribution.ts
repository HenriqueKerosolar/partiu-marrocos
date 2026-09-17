import type { AttributionTouchType, AttributionTouch } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { TenantTx } from "./tenant-db";
import { withTenant } from "./tenant-db";

/**
 * Attribution (T6) — captura de onde um lead realmente veio (UTM/gclid/
 * fbclid/landing page/referrer), gravado em `AttributionTouch` (colunas
 * reais, não Json — ver comentário do model no schema.prisma).
 *
 * Esta rodada grava só `tipo: CONVERSION` (o momento em que o formulário
 * público é enviado) — FIRST/LAST touch exigiriam um visitante/sessão
 * persistente no site, que não existe ainda (fora de escopo, "preparar
 * posteriormente" no comando de autorização).
 */

const MAX_LEN = {
  source: 100,
  medium: 100,
  campaign: 150,
  content: 150,
  term: 150,
  gclid: 200,
  fbclid: 200,
  landingPage: 1000,
  referrer: 1000,
} as const;

export interface AttributionInput {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
}

/**
 * Nunca confia cegamente no valor recebido (vem de query string pública,
 * controlável por qualquer visitante): apara espaço, descarta vazio, corta
 * no tamanho máximo. Não valida formato/conteúdo além disso — um
 * `utm_source` malicioso vira só uma string truncada, nunca é interpretado
 * como HTML/SQL/comando (nunca renderizado como HTML em lugar nenhum,
 * nunca concatenado em SQL bruto).
 */
function sanitizar(valor: string | null | undefined, maxLen: number): string | null {
  if (valor == null) return null;
  const limpo = String(valor).trim();
  if (!limpo) return null;
  return limpo.slice(0, maxLen);
}

/** true se pelo menos um campo de atribuição real foi informado — evita gravar uma linha inteiramente vazia. */
export function temAtribuicao(input: AttributionInput): boolean {
  return Object.values(input).some((v) => v != null && String(v).trim() !== "");
}

export interface RegistrarAttributionTouchParams extends AttributionInput {
  tenantId: string;
  contactId: string;
  leadId?: string | null;
  tipo?: AttributionTouchType;
}

/**
 * Grava um touch de atribuição. Recebe `tx` (não `prisma`) de propósito —
 * é sempre chamado DENTRO da mesma transação `withTenant` que cria o
 * Contact/Lead (ver apps/web .../api/public/leads/route.ts), nunca abre a
 * própria transação. Isso garante atomicidade: ou Contact+Lead+Attribution
 * gravam juntos, ou nenhum grava (nunca um lead "órfão" de atribuição por
 * uma falha no meio do caminho).
 */
export async function registrarAttributionTouch(tx: TenantTx, params: RegistrarAttributionTouchParams): Promise<AttributionTouch> {
  return tx.attributionTouch.create({
    data: {
      tenantId: params.tenantId,
      contactId: params.contactId,
      leadId: params.leadId ?? null,
      tipo: params.tipo ?? "CONVERSION",
      source: sanitizar(params.source, MAX_LEN.source),
      medium: sanitizar(params.medium, MAX_LEN.medium),
      campaign: sanitizar(params.campaign, MAX_LEN.campaign),
      content: sanitizar(params.content, MAX_LEN.content),
      term: sanitizar(params.term, MAX_LEN.term),
      gclid: sanitizar(params.gclid, MAX_LEN.gclid),
      fbclid: sanitizar(params.fbclid, MAX_LEN.fbclid),
      landingPage: sanitizar(params.landingPage, MAX_LEN.landingPage),
      referrer: sanitizar(params.referrer, MAX_LEN.referrer),
    },
  });
}

export interface ResumoAtribuicao {
  chave: string; // valor de source/campaign (ou "(nenhum)" quando null)
  totalLeads: number;
}

/**
 * Prova de que o modelo suporta as consultas analíticas que a autorização
 * pediu ("leads por source", "leads por campaign") — GROUP BY sobre coluna
 * indexada, não sobre Json. `vendas por campaign`/CAC/ROAS/margem dependem
 * de Finance Core (fora desta rodada); esta função cobre só a parte que já
 * tem dado real hoje (contagem de leads).
 */
export async function contarLeadsPorAtribuicao(
  prisma: PrismaClient,
  tenantId: string,
  agrupar: "source" | "campaign",
): Promise<ResumoAtribuicao[]> {
  return withTenant(prisma, tenantId, async (tx) => {
    const grupos = await tx.attributionTouch.groupBy({
      by: [agrupar],
      where: { tenantId, leadId: { not: null } },
      _count: { _all: true },
    });
    return grupos
      .map((g) => ({ chave: (g[agrupar] as string | null) ?? "(nenhum)", totalLeads: g._count._all }))
      .sort((a, b) => b.totalLeads - a.totalLeads);
  });
}
