import type { PrismaClient, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";
import { LIMITES_PADRAO, type LimitesPoliticaComercial } from "./crm/proposta-politica";

/**
 * CommercialPolicy (PM-NIGHT-RUN-02, Etapa 3, §23) — torna os limiares da
 * política comercial de proposta (`proposta-politica.ts`) configuráveis
 * por tenant, corrigindo a limitação registrada em Proposal Foundation 01
 * ("limiares fixos, não configuráveis por tenant"). Ausência de linha =
 * `LIMITES_PADRAO` (mesmo valor que já era hardcoded antes) — nenhum
 * tenant existente muda de comportamento silenciosamente.
 */

export async function obterLimitesComerciais(prisma: PrismaClient, tenantId: string): Promise<LimitesPoliticaComercial> {
  const politica = await withTenant(prisma, tenantId, (tx) => tx.commercialPolicy.findUnique({ where: { tenantId } }));
  if (!politica) return LIMITES_PADRAO;
  return {
    limiteDescontoRelevante: politica.limiteDescontoRelevante,
    limiteMudancaPrecoExcepcional: politica.limiteMudancaPrecoExcepcional,
    limiteMargemMinima: politica.limiteMargemMinima,
  };
}

export interface AtualizarPoliticaComercialParams {
  tenantId: string;
  limites: Partial<LimitesPoliticaComercial>;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type AtualizarPoliticaResultado = { ok: true; limites: LimitesPoliticaComercial } | { ok: false; motivo: "VALOR_INVALIDO" };

/** Toda fração deve ficar em (0, 1] — 0 tornaria QUALQUER proposta um gatilho de Gate (provavelmente não intencional), >1 nunca faz sentido pra uma fração. */
function validarFracao(v: number | undefined): boolean {
  return v === undefined || (v > 0 && v <= 1);
}

export async function atualizarPoliticaComercial(prisma: PrismaClient, params: AtualizarPoliticaComercialParams): Promise<AtualizarPoliticaResultado> {
  if (!validarFracao(params.limites.limiteDescontoRelevante) || !validarFracao(params.limites.limiteMudancaPrecoExcepcional) || !validarFracao(params.limites.limiteMargemMinima)) {
    return { ok: false, motivo: "VALOR_INVALIDO" };
  }

  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.commercialPolicy.findUnique({ where: { tenantId: params.tenantId } });
    const politica = await tx.commercialPolicy.upsert({
      where: { tenantId: params.tenantId },
      create: {
        tenantId: params.tenantId,
        limiteDescontoRelevante: params.limites.limiteDescontoRelevante ?? LIMITES_PADRAO.limiteDescontoRelevante,
        limiteMudancaPrecoExcepcional: params.limites.limiteMudancaPrecoExcepcional ?? LIMITES_PADRAO.limiteMudancaPrecoExcepcional,
        limiteMargemMinima: params.limites.limiteMargemMinima ?? LIMITES_PADRAO.limiteMargemMinima,
        atualizadoPorId: params.actorType === "HUMANO" ? params.userId : null,
      },
      update: {
        ...(params.limites.limiteDescontoRelevante !== undefined ? { limiteDescontoRelevante: params.limites.limiteDescontoRelevante } : {}),
        ...(params.limites.limiteMudancaPrecoExcepcional !== undefined ? { limiteMudancaPrecoExcepcional: params.limites.limiteMudancaPrecoExcepcional } : {}),
        ...(params.limites.limiteMargemMinima !== undefined ? { limiteMargemMinima: params.limites.limiteMargemMinima } : {}),
        atualizadoPorId: params.actorType === "HUMANO" ? params.userId : null,
      },
    });

    // Audit obrigatório para alteração da política (§23) — grava antes/depois pra auditoria real, não só "mudou algo".
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "COMMERCIAL_POLICY_ATUALIZADA",
      entidade: "CommercialPolicy",
      entidadeId: politica.id,
      resultado: "ok",
      detalhe: {
        antes: atual
          ? { limiteDescontoRelevante: atual.limiteDescontoRelevante, limiteMudancaPrecoExcepcional: atual.limiteMudancaPrecoExcepcional, limiteMargemMinima: atual.limiteMargemMinima }
          : "default (LIMITES_PADRAO)",
        depois: { limiteDescontoRelevante: politica.limiteDescontoRelevante, limiteMudancaPrecoExcepcional: politica.limiteMudancaPrecoExcepcional, limiteMargemMinima: politica.limiteMargemMinima },
      },
    });

    return {
      ok: true as const,
      limites: { limiteDescontoRelevante: politica.limiteDescontoRelevante, limiteMudancaPrecoExcepcional: politica.limiteMudancaPrecoExcepcional, limiteMargemMinima: politica.limiteMargemMinima },
    };
  });
}
