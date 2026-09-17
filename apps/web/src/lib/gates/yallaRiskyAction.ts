import { prisma, withTenant, criarGate, buscarGate, type GateCategoria } from "@partiumarrocos/db";

/**
 * Fixture mínima exigida pela autorização de T1 (item 11): prova que o Yalla
 * NÃO consegue executar uma ação classificada como de risco sem aprovação —
 * não constrói preço/desconto/pagamento/cancelamento reais (isso é T3,
 * fora do escopo autorizado). A "ação controlada de teste" aqui é gravar uma
 * Note no lead — segura, reversível, e prova o fluxo de ponta a ponta.
 *
 * Fluxo: solicita → Gate criado (PENDENTE, bloqueado) → decisão humana
 * (aprova/rejeita/expira) → só se APROVADO a ação controlada roda.
 *
 * Sem `import "server-only"` de propósito (mesmo padrão já adotado em
 * `apps/web/src/lib/whatsapp/cloud-api.ts`): o guard quebra o teste direto no
 * Vitest, e este módulo não expõe nenhuma credencial embutida que precise da
 * proteção — só chama Prisma via `packages/db`, que já é o limite real de
 * acesso a dado (RLS), não um `"use client"` acidental.
 */

export interface SolicitarAcaoDeRiscoParams {
  tenantId: string;
  leadId: string;
  categoria: GateCategoria;
  descricao: string;
}

export async function solicitarAcaoDeRisco(params: SolicitarAcaoDeRiscoParams): Promise<{ gateId: string }> {
  const gate = await criarGate(prisma, {
    tenantId: params.tenantId,
    categoria: params.categoria,
    acaoProposta: params.descricao,
    motivo: "Solicitado pelo agente Yalla durante atendimento",
    solicitanteTipo: "AGENTE",
    solicitanteLabel: "yalla",
    metadata: { leadId: params.leadId },
  });
  return { gateId: gate.id };
}

export type ExecucaoControladaResultado =
  | { executado: true }
  | { executado: false; motivo: "GATE_NAO_ENCONTRADO" | "GATE_NAO_APROVADO"; statusAtual?: string };

/**
 * Só executa a ação controlada de teste se o Gate associado estiver
 * APROVADO — nunca antes, nunca se REJEITADO/EXPIRADO/ainda PENDENTE. Quem
 * chama esta função é o próprio fluxo do Yalla, depois de checar (ou ser
 * notificado) que o gate mudou de estado — nunca assume aprovação, sempre
 * relê o estado real do banco (mesmo princípio "nunca confiar em estado
 * local" comprovado no motor de orquestração do Ai DEV, auditoria seção 6).
 */
export async function executarAcaoControladaSeAprovado(tenantId: string, gateId: string): Promise<ExecucaoControladaResultado> {
  const gate = await buscarGate(prisma, tenantId, gateId);
  if (!gate) return { executado: false, motivo: "GATE_NAO_ENCONTRADO" };
  if (gate.status !== "APROVADO") return { executado: false, motivo: "GATE_NAO_APROVADO", statusAtual: gate.status };

  const meta = gate.metadata as { leadId?: string } | null;
  if (meta?.leadId) {
    await withTenant(prisma, tenantId, (tx) =>
      tx.note.create({
        data: {
          tenantId,
          leadId: meta.leadId!,
          conteudo: `[Yalla] Ação de risco executada após aprovação do gate ${gate.id}: ${gate.acaoProposta}`,
        },
      }),
    );
  }

  return { executado: true };
}
