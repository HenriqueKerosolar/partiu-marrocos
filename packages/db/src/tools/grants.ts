import type { PrismaClient, ActorType, AgentGrant } from "@prisma/client";
import { withTenant } from "../tenant-db";
import { registrarEvento } from "../audit";

/**
 * Grant/Policy do AGENTE — default-deny explícito, separado do RBAC humano
 * (T3 §32): um Administrador humano ter `leads.manage` não dá ao Yalla
 * nenhuma permissão. Nunca existe um grant "*"/admin/all — sempre a
 * capability exata de uma tool (1 tool = 1 capability, ver types.ts).
 */

export async function possuiGrant(prisma: PrismaClient, tenantId: string, agent: string, capability: string): Promise<boolean> {
  const grant = await withTenant(prisma, tenantId, (tx) => tx.agentGrant.findUnique({ where: { tenantId_agent_capability: { tenantId, agent, capability } } }));
  return grant?.ativo ?? false;
}

export interface AlterarGrantParams {
  tenantId: string;
  agent: string;
  capability: string;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function concederCapability(prisma: PrismaClient, params: AlterarGrantParams): Promise<AgentGrant> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const grant = await tx.agentGrant.upsert({
      where: { tenantId_agent_capability: { tenantId: params.tenantId, agent: params.agent, capability: params.capability } },
      update: { ativo: true },
      create: { tenantId: params.tenantId, agent: params.agent, capability: params.capability, ativo: true },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.userId ?? null,
      actorLabel: params.actorLabel ?? null,
      acao: "AGENT_GRANT_CONCEDIDO",
      entidade: "AgentGrant",
      entidadeId: grant.id,
      resultado: "ativo",
      detalhe: { agent: params.agent, capability: params.capability },
    });
    return grant;
  });
}

/** Soft-revoke (ativo=false) — mantém histórico, nunca apaga a linha. */
export async function revogarCapability(prisma: PrismaClient, params: AlterarGrantParams): Promise<AgentGrant | null> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const existente = await tx.agentGrant.findUnique({ where: { tenantId_agent_capability: { tenantId: params.tenantId, agent: params.agent, capability: params.capability } } });
    if (!existente) return null;
    const grant = await tx.agentGrant.update({ where: { id: existente.id }, data: { ativo: false } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.userId ?? null,
      actorLabel: params.actorLabel ?? null,
      acao: "AGENT_GRANT_REVOGADO",
      entidade: "AgentGrant",
      entidadeId: grant.id,
      resultado: "inativo",
      detalhe: { agent: params.agent, capability: params.capability },
    });
    return grant;
  });
}

export async function listarGrants(prisma: PrismaClient, tenantId: string, agent?: string): Promise<AgentGrant[]> {
  return withTenant(prisma, tenantId, (tx) => tx.agentGrant.findMany({ where: { tenantId, ...(agent ? { agent } : {}) }, orderBy: { capability: "asc" } }));
}

/**
 * Provisiona de uma vez o conjunto padrão de capabilities de um agente
 * (usado pelo seed e por instalações existentes — mesmo espírito do
 * "procedimento operacional" de PM-BLOQ-001 para quem já tinha dado antes
 * da migração). Idempotente (upsert por capability).
 */
export async function provisionarGrantsPadrao(
  prisma: PrismaClient,
  params: { tenantId: string; agent: string; capabilities: string[]; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<void> {
  for (const capability of params.capabilities) {
    await concederCapability(prisma, { tenantId: params.tenantId, agent: params.agent, capability, actorType: params.actorType, userId: params.userId, actorLabel: params.actorLabel });
  }
}
