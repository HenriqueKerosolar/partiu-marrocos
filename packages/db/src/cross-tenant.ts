import type { PrismaClient, WhatsappAccount } from "@prisma/client";
import { withSystem } from "./tenant-db";

export interface UserMembershipSummary {
  membershipId: string;
  tenantId: string;
  tenantNome: string;
  tenantSlug: string;
  roleId: string;
  roleNome: string;
}

/**
 * Única leitura cross-tenant permitida à aplicação: "a quais empresas este
 * usuário pertence". Inerentemente cross-tenant, mas sempre filtrada pelo
 * próprio userId — só chamar com o id do usuário já autenticado na própria
 * requisição, nunca com um id vindo de input. Porte literal do CongáOne.
 */
export async function getMembershipsForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<UserMembershipSummary[]> {
  const memberships = await withSystem(prisma, (tx) =>
    tx.membership.findMany({
      where: { userId },
      include: { tenant: true, role: true },
    }),
  );

  return memberships.map((m) => ({
    membershipId: m.id,
    tenantId: m.tenantId,
    tenantNome: m.tenant.nome,
    tenantSlug: m.tenant.slug,
    roleId: m.roleId,
    roleNome: m.role.nome,
  }));
}

/**
 * Segunda leitura cross-tenant permitida à aplicação: resolver a que tenant
 * pertence um número do WhatsApp Cloud API, a partir do `phoneNumberId` que a
 * Meta manda no payload do webhook. Mesma justificativa do login (seção
 * acima): o webhook ainda não sabe o tenant no momento em que chega — é
 * exatamente esse lookup que descobre. `phoneNumberId` é atribuído pela Meta
 * e é globalmente único (constraint no schema), então a busca não corre risco
 * de ambiguidade entre tenants.
 */
export async function findWhatsappAccountByPhoneNumberId(
  prisma: PrismaClient,
  phoneNumberId: string,
): Promise<WhatsappAccount | null> {
  return withSystem(prisma, (tx) => tx.whatsappAccount.findUnique({ where: { phoneNumberId } }));
}

/**
 * Terceira leitura cross-tenant: valida o `hub.verify_token` que a Meta manda
 * no GET de configuração do webhook, antes de saber a qual conta/tenant ele
 * pertence. Só usado para o handshake de verificação (nunca no POST de
 * mensagens, que resolve a conta por `phoneNumberId`).
 */
export async function findWhatsappAccountByVerifyToken(
  prisma: PrismaClient,
  verifyToken: string,
): Promise<WhatsappAccount | null> {
  return withSystem(prisma, (tx) => tx.whatsappAccount.findFirst({ where: { verifyToken } }));
}
