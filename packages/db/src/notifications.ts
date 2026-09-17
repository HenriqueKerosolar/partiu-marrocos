import type { PrismaClient, Notification, NotificationChannel } from "@prisma/client";
import { withTenant } from "./tenant-db";

/**
 * PM-CONV-10 — Notifications Foundation. Domínio genérico, nasce com o
 * canal `IN_APP` real (sem credencial nenhuma — só uma linha no banco +
 * uma tela que lista) e o contrato pronto pros outros 4 canais
 * (`NotificationChannel`). WHATSAPP reaproveita o Job Engine (T5) já real
 * quando for cabeado — nunca um segundo mecanismo de envio. EMAIL/PUSH
 * ficam explicitamente bloqueados (nenhum provider configurado neste
 * ambiente) — nunca simulados.
 */

export interface CriarNotificacaoParams {
  tenantId: string;
  destinatarioId: string;
  canal?: NotificationChannel;
  tipo: string;
  titulo: string;
  corpo: string;
  entidadeTipo?: string | null;
  entidadeId?: string | null;
}

export async function criarNotificacao(prisma: PrismaClient, params: CriarNotificacaoParams): Promise<Notification> {
  return withTenant(prisma, params.tenantId, (tx) =>
    tx.notification.create({
      data: {
        tenantId: params.tenantId,
        destinatarioId: params.destinatarioId,
        canal: params.canal ?? "IN_APP",
        tipo: params.tipo,
        titulo: params.titulo,
        corpo: params.corpo,
        entidadeTipo: params.entidadeTipo ?? null,
        entidadeId: params.entidadeId ?? null,
      },
    }),
  );
}

export async function listarNotificacoesDoUsuario(prisma: PrismaClient, tenantId: string, userId: string, opts?: { somenteNaoLidas?: boolean; take?: number }): Promise<Notification[]> {
  return withTenant(prisma, tenantId, (tx) =>
    tx.notification.findMany({
      where: { tenantId, destinatarioId: userId, ...(opts?.somenteNaoLidas ? { lida: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts?.take ?? 50,
    }),
  );
}

export async function contarNaoLidas(prisma: PrismaClient, tenantId: string, userId: string): Promise<number> {
  return withTenant(prisma, tenantId, (tx) => tx.notification.count({ where: { tenantId, destinatarioId: userId, lida: false } }));
}

export type MarcarComoLidaResultado = { ok: true; notification: Notification } | { ok: false; motivo: "NAO_ENCONTRADA" };

/** Escopado ao próprio usuário por design — `userId` do ctx confiável, nunca lido do input, mesmo padrão já usado em todo o resto do produto (nunca deixar o chamador afirmar "sou o dono desta notificação" sem checar). */
export async function marcarComoLida(prisma: PrismaClient, tenantId: string, notificationId: string, userId: string): Promise<MarcarComoLidaResultado> {
  return withTenant(prisma, tenantId, async (tx) => {
    const atual = await tx.notification.findUnique({ where: { id: notificationId } });
    if (!atual || atual.destinatarioId !== userId) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (atual.lida) return { ok: true, notification: atual };
    const notification = await tx.notification.update({ where: { id: atual.id }, data: { lida: true, lidaEm: new Date() } });
    return { ok: true, notification };
  });
}

export async function marcarTodasComoLidas(prisma: PrismaClient, tenantId: string, userId: string): Promise<number> {
  return withTenant(prisma, tenantId, async (tx) => {
    const r = await tx.notification.updateMany({ where: { tenantId, destinatarioId: userId, lida: false }, data: { lida: true, lidaEm: new Date() } });
    return r.count;
  });
}
