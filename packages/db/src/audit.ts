import type { Prisma, PrismaClient, ActorType } from "@prisma/client";

/**
 * Ponto único de escrita em AuditLog — mesmo padrão "single writer" do Ai DEV
 * Orquestrador (auditoria seção 19, `recordEvent`). Append-only garantido em
 * banco por trigger (ver rls.sql/migration), não só por não haver função de
 * update/delete aqui — mesmo uma query manual malfeita não consegue alterar
 * um evento já gravado.
 *
 * Responsabilidade de quem chama: nunca colocar secret/credencial em
 * `detalhe` — este módulo não redige nada, só grava (mesma responsabilidade
 * do lado do chamador no Ai DEV).
 */
export interface RegistrarEventoParams {
  tenantId: string;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
  acao: string;
  entidade?: string | null;
  entidadeId?: string | null;
  resultado: string;
  detalhe?: unknown;
}

type TenantScopedClient = PrismaClient | Prisma.TransactionClient;

export async function registrarEvento(tx: TenantScopedClient, params: RegistrarEventoParams): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.userId ?? null,
      actorLabel: params.actorLabel ?? null,
      acao: params.acao,
      entidade: params.entidade ?? null,
      entidadeId: params.entidadeId ?? null,
      resultado: params.resultado,
      detalhe: params.detalhe === undefined ? undefined : (params.detalhe as Prisma.InputJsonValue),
    },
  });
}

export async function listarAuditoria(
  tx: TenantScopedClient,
  params: { tenantId: string; entidade?: string; entidadeId?: string; take?: number },
) {
  return tx.auditLog.findMany({
    where: {
      tenantId: params.tenantId,
      ...(params.entidade ? { entidade: params.entidade } : {}),
      ...(params.entidadeId ? { entidadeId: params.entidadeId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.take ?? 100,
  });
}
