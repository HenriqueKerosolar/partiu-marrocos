import { createHash } from "crypto";
import type { PrismaClient, Gate, GateStatus, GateCategoria, ActorType, Prisma } from "@prisma/client";
import { withTenant, type TenantTx } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-04, Track C, §8C — fingerprint do "sujeito" de um Gate (ex.: os
 * campos financeiros de uma Commission no momento da solicitação). Detecta
 * adulteração dos dados entre aprovação e execução — o mecanismo de Gate já
 * existente (T1) não fazia isso; confirmado por auditoria (PM_CONV_02_
 * INVENTARIO.md, Grupo 2 item 1: reaproveitar a LÓGICA da 0.4.11, nunca o
 * código). Determinístico: mesmas chaves na mesma ordem sempre geram o
 * mesmo hash, então comparar dois fingerprints é só `===`.
 */
export function calcularFingerprint(sujeito: Record<string, unknown>): string {
  const chavesOrdenadas = Object.keys(sujeito).sort();
  const canonical = JSON.stringify(chavesOrdenadas.map((k) => [k, sujeito[k]]));
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Gates/Approval (T1) — porte adaptado do Ai DEV Orquestrador (HumanGate,
 * auditoria seção 5). Ver nota de arquitetura completa nos comentários do
 * model `Gate` em schema.prisma — aqui só a lógica de aplicação.
 */

const DEFAULT_EXPIRACAO_MS = 24 * 60 * 60 * 1000; // 24h — mesma ordem de grandeza usada como referência pelo Ai DEV

// Máquina de estados: todo estado decidido/expirado é terminal — mesma
// semântica comprovada do Ai DEV (auditoria seção 5: "retomada automática só
// quando aprovado", nenhuma transição sai de um estado terminal).
const TRANSICOES_VALIDAS: Record<GateStatus, GateStatus[]> = {
  PENDENTE: ["APROVADO", "REJEITADO", "MODIFICADO", "EXPIRADO"],
  APROVADO: [],
  REJEITADO: [],
  MODIFICADO: [],
  EXPIRADO: [],
};

/** Pura, testável sem banco — usada como validação extra antes de qualquer UPDATE (defesa em profundidade). */
export function transicaoValida(de: GateStatus, para: GateStatus): boolean {
  return TRANSICOES_VALIDAS[de]?.includes(para) ?? false;
}

export interface CriarGateParams {
  tenantId: string;
  categoria: GateCategoria;
  acaoProposta: string;
  motivo: string;
  riscoDescricao?: string;
  alternativas?: unknown;
  solicitanteTipo: ActorType;
  solicitanteId?: string; // só quando solicitanteTipo=HUMANO
  solicitanteLabel?: string; // ex.: "yalla" quando solicitanteTipo=AGENTE
  expiraEmMs?: number;
  agentId?: string;
  executionId?: string;
  toolId?: string;
  metadata?: unknown;
  subjectFingerprint?: string; // opcional e retrocompatível — ver `calcularFingerprint` acima
}

export async function criarGate(prisma: PrismaClient, params: CriarGateParams): Promise<Gate> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const gate = await tx.gate.create({
      data: {
        tenantId: params.tenantId,
        categoria: params.categoria,
        acaoProposta: params.acaoProposta,
        motivo: params.motivo,
        riscoDescricao: params.riscoDescricao ?? null,
        alternativas: params.alternativas as Prisma.InputJsonValue | undefined,
        solicitanteTipo: params.solicitanteTipo,
        solicitanteId: params.solicitanteTipo === "HUMANO" ? (params.solicitanteId ?? null) : null,
        solicitanteLabel: params.solicitanteTipo === "HUMANO" ? null : (params.solicitanteLabel ?? null),
        expiresAt: new Date(Date.now() + (params.expiraEmMs ?? DEFAULT_EXPIRACAO_MS)),
        agentId: params.agentId ?? null,
        executionId: params.executionId ?? null,
        toolId: params.toolId ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
        subjectFingerprint: params.subjectFingerprint ?? null,
      },
    });

    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.solicitanteTipo,
      userId: params.solicitanteTipo === "HUMANO" ? params.solicitanteId : null,
      actorLabel: params.solicitanteLabel ?? null,
      acao: "gate_requested",
      entidade: "Gate",
      entidadeId: gate.id,
      resultado: "pendente",
      detalhe: { categoria: gate.categoria, acaoProposta: gate.acaoProposta },
    });

    return gate;
  });
}

/** Marca como EXPIRADO todo gate PENDENTE cujo prazo já passou — sweep "preguiçoso" (sem Job Engine/worker, T5 não existe ainda). */
async function expirarSeVencido(tx: TenantTx, tenantId: string, gateId?: string): Promise<void> {
  const expirados = await tx.gate.findMany({
    where: { tenantId, status: "PENDENTE", expiresAt: { lte: new Date() }, ...(gateId ? { id: gateId } : {}) },
    select: { id: true, categoria: true },
  });
  for (const g of expirados) {
    const result = await tx.gate.updateMany({
      where: { id: g.id, tenantId, status: "PENDENTE", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRADO" },
    });
    if (result.count > 0) {
      await registrarEvento(tx, {
        tenantId,
        actorType: "SISTEMA",
        acao: "gate_expired",
        entidade: "Gate",
        entidadeId: g.id,
        resultado: "expirado",
        detalhe: { categoria: g.categoria },
      });
    }
  }
}

/** Sweep de expiração exposto para uso em telas de listagem (nunca precisa de worker/cron para T1). */
export async function expirarGatesVencidos(prisma: PrismaClient, tenantId: string): Promise<void> {
  await withTenant(prisma, tenantId, (tx) => expirarSeVencido(tx, tenantId));
}

export async function listarGatesPendentes(prisma: PrismaClient, tenantId: string): Promise<Gate[]> {
  return withTenant(prisma, tenantId, async (tx) => {
    await expirarSeVencido(tx, tenantId);
    return tx.gate.findMany({ where: { tenantId, status: "PENDENTE" }, orderBy: { requestedAt: "asc" } });
  });
}

export async function buscarGate(prisma: PrismaClient, tenantId: string, gateId: string): Promise<Gate | null> {
  return withTenant(prisma, tenantId, (tx) => tx.gate.findUnique({ where: { id: gateId } }));
}

/**
 * Compara o fingerprint gravado no Gate com o estado ATUAL do sujeito.
 * Gates sem fingerprint (retrocompatibilidade — etapas anteriores a esta
 * rodada) sempre retornam `true` (nunca bloqueiam execução de Gates
 * antigos). Um Gate COM fingerprint que não bate = dado mudou depois da
 * aprovação — quem chama deve recusar a execução, nunca prosseguir
 * silenciosamente (§8C: "a aprovação anterior não deve valer silenciosamente").
 */
export function fingerprintCompativel(gate: Pick<Gate, "subjectFingerprint">, sujeitoAtual: Record<string, unknown>): boolean {
  if (!gate.subjectFingerprint) return true;
  return gate.subjectFingerprint === calcularFingerprint(sujeitoAtual);
}

export type GateDecisao = "APROVADO" | "REJEITADO" | "MODIFICADO";
export type DecidirGateResultado =
  | { ok: true; gate: Gate }
  | { ok: false; motivo: "NAO_ENCONTRADO" | "JA_DECIDIDO" | "EXPIRADO" | "DECISOR_NAO_E_MEMBRO_DO_TENANT" };

export interface DecidirGateParams {
  tenantId: string;
  gateId: string;
  decisao: GateDecisao;
  decisorId: string; // sempre um userId real — nunca "yalla"/"system" (ver nota de estrutura em schema.prisma)
  resultado?: unknown;
}

/**
 * Decide um gate pendente. Atômico via `updateMany` com WHERE incluindo o
 * estado esperado (`status: 'PENDENTE'`) — mesmo padrão de UPDATE
 * condicional que a auditoria do Ai DEV comprovou sob concorrência real
 * (seção 7, `leaseNextExecution`/`reapExpiredLeases`): de duas chamadas
 * simultâneas na mesma linha, o lock de linha do Postgres garante que só uma
 * `UPDATE...WHERE status='PENDENTE'` afeta a linha — a outra recebe count=0
 * e é diagnosticada como JA_DECIDIDO. Isso dá idempotência e proteção contra
 * corrida sem precisar de lock explícito na aplicação.
 */
export async function decidirGate(prisma: PrismaClient, params: DecidirGateParams): Promise<DecidirGateResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    // Defesa em profundidade: decisorId estruturalmente só pode ser um User
    // (FK), mas isso não garante que seja MEMBRO deste tenant — confere
    // explicitamente via Membership (que também tem RLS, então já vem
    // filtrado pro tenant corrente).
    const membro = await tx.membership.findFirst({ where: { tenantId: params.tenantId, userId: params.decisorId } });
    if (!membro) return { ok: false, motivo: "DECISOR_NAO_E_MEMBRO_DO_TENANT" };

    // Expira primeiro (lazy sweep) — se venceu, a tentativa de decisão abaixo
    // já vai falhar corretamente contra status='EXPIRADO'. A validade da
    // transição PENDENTE→decisao em si é garantida pelo próprio tipo
    // `GateDecisao` (só aceita os 3 valores válidos a partir de PENDENTE) e
    // reforçada atomicamente pelo WHERE status='PENDENTE' abaixo —
    // `transicaoValida` fica exportada para a máquina de estados ser testável
    // isoladamente (não é chamada aqui de novo pra não duplicar a mesma regra
    // de forma vazia).
    await expirarSeVencido(tx, params.tenantId, params.gateId);

    const update = await tx.gate.updateMany({
      where: { id: params.gateId, tenantId: params.tenantId, status: "PENDENTE" },
      data: {
        status: params.decisao,
        decisorId: params.decisorId,
        decidedAt: new Date(),
        resultado: params.resultado as Prisma.InputJsonValue | undefined,
      },
    });

    if (update.count === 0) {
      const atual = await tx.gate.findUnique({ where: { id: params.gateId } });
      if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };
      if (atual.status === "EXPIRADO") return { ok: false, motivo: "EXPIRADO" };
      return { ok: false, motivo: "JA_DECIDIDO" };
    }

    const gate = await tx.gate.findUniqueOrThrow({ where: { id: params.gateId } });

    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: "HUMANO",
      userId: params.decisorId,
      acao: `gate_${params.decisao.toLowerCase()}`,
      entidade: "Gate",
      entidadeId: gate.id,
      resultado: params.decisao.toLowerCase(),
      detalhe: { categoria: gate.categoria },
    });

    return { ok: true, gate };
  });
}
