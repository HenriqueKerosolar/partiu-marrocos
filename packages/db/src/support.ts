import type { PrismaClient, SupportTicket, SupportTicketCategoria, SupportTicketPrioridade, SupportTicketStatus, ActorType } from "@prisma/client";
import { withTenant, type TenantTx } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-04, Track D — Ouvidoria/Support. Semanticamente distinto de Lead
 * (funil comercial) e Conversation/Message (atendimento em tempo real) —
 * `SupportTicketMessage.conversationId` é opcional e só REFERENCIA uma
 * conversa existente quando aplicável, nunca duplica conteúdo (§6D).
 */

async function proximoProtocolo(tx: TenantTx, tenantId: string): Promise<string> {
  const ano = new Date().getFullYear();
  const inicioAno = new Date(Date.UTC(ano, 0, 1));
  const fimAno = new Date(Date.UTC(ano + 1, 0, 1));
  const contagem = await tx.supportTicket.count({ where: { tenantId, createdAt: { gte: inicioAno, lt: fimAno } } });
  return `OUV-${ano}-${String(contagem + 1).padStart(6, "0")}`;
}

export interface AbrirTicketParams {
  tenantId: string;
  assunto: string;
  categoria: SupportTicketCategoria;
  prioridade?: SupportTicketPrioridade;
  leadId?: string | null;
  origem?: string | null;
  mensagemInicial: string;
  autorUserId?: string | null; // preenchido quando aberto pela EQUIPE em nome de um cliente; null = aberto pelo próprio cliente
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function abrirTicket(prisma: PrismaClient, params: AbrirTicketParams): Promise<SupportTicket> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const protocolo = await proximoProtocolo(tx, params.tenantId);
    const ticket = await tx.supportTicket.create({
      data: {
        tenantId: params.tenantId,
        protocolo,
        leadId: params.leadId ?? null,
        categoria: params.categoria,
        prioridade: params.prioridade ?? "NORMAL",
        assunto: params.assunto,
        origem: params.origem ?? null,
      },
    });
    await tx.supportTicketMessage.create({
      data: {
        tenantId: params.tenantId,
        ticketId: ticket.id,
        autorTipo: params.autorUserId ? "EQUIPE" : "CLIENTE",
        autorUserId: params.autorUserId ?? null,
        corpo: params.mensagemInicial,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "SUPPORT_TICKET_ABERTO",
      entidade: "SupportTicket",
      entidadeId: ticket.id,
      resultado: "ok",
      detalhe: { protocolo: ticket.protocolo, categoria: ticket.categoria },
    });
    return ticket;
  });
}

export async function responderTicket(
  prisma: PrismaClient,
  params: { tenantId: string; ticketId: string; corpo: string; autorUserId: string; conversationId?: string | null; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<{ ok: true } | { ok: false; motivo: "NAO_ENCONTRADO" | "TICKET_FECHADO" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const ticket = await tx.supportTicket.findUnique({ where: { id: params.ticketId } });
    if (!ticket) return { ok: false, motivo: "NAO_ENCONTRADO" };
    if (ticket.status === "FECHADO") return { ok: false, motivo: "TICKET_FECHADO" };

    const mensagem = await tx.supportTicketMessage.create({
      data: { tenantId: params.tenantId, ticketId: ticket.id, autorTipo: "EQUIPE", autorUserId: params.autorUserId, corpo: params.corpo, conversationId: params.conversationId ?? null },
    });
    if (ticket.status === "ABERTO") await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: "EM_ANDAMENTO" } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "SUPPORT_TICKET_RESPONDIDO",
      entidade: "SupportTicket",
      entidadeId: ticket.id,
      resultado: "ok",
      detalhe: { mensagemId: mensagem.id, statusAntes: ticket.status },
    });
    return { ok: true };
  });
}

export type MoverStatusTicketResultado = { ok: true; ticket: SupportTicket } | { ok: false; motivo: "NAO_ENCONTRADO" | "TRANSICAO_INVALIDA" };

const TRANSICOES_VALIDAS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  ABERTO: ["EM_ANDAMENTO", "RESOLVIDO", "FECHADO"],
  EM_ANDAMENTO: ["RESOLVIDO", "FECHADO"],
  RESOLVIDO: ["FECHADO", "EM_ANDAMENTO"], // reabertura permitida a partir de RESOLVIDO
  FECHADO: [],
};

export function transicaoValidaTicket(de: SupportTicketStatus, para: SupportTicketStatus): boolean {
  return TRANSICOES_VALIDAS[de]?.includes(para) ?? false;
}

export async function moverStatusTicket(
  prisma: PrismaClient,
  params: { tenantId: string; ticketId: string; novoStatus: SupportTicketStatus; resolucao?: string | null; responsavelId?: string | null; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<MoverStatusTicketResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.supportTicket.findUnique({ where: { id: params.ticketId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };
    if (!transicaoValidaTicket(atual.status, params.novoStatus)) return { ok: false, motivo: "TRANSICAO_INVALIDA" };

    const ticket = await tx.supportTicket.update({
      where: { id: atual.id },
      data: {
        status: params.novoStatus,
        ...(params.resolucao !== undefined ? { resolucao: params.resolucao } : {}),
        ...(params.responsavelId !== undefined ? { responsavelId: params.responsavelId } : {}),
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "SUPPORT_TICKET_STATUS_ALTERADO",
      entidade: "SupportTicket",
      entidadeId: ticket.id,
      resultado: "ok",
      detalhe: { de: atual.status, para: params.novoStatus },
    });
    return { ok: true, ticket };
  });
}

export async function avaliarTicket(
  prisma: PrismaClient,
  params: { tenantId: string; ticketId: string; nota: number; comentario?: string | null; actorType?: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<{ ok: true } | { ok: false; motivo: "NAO_ENCONTRADO" | "NOTA_INVALIDA" | "TICKET_NAO_FECHADO" }> {
  if (!Number.isInteger(params.nota) || params.nota < 1 || params.nota > 5) return { ok: false, motivo: "NOTA_INVALIDA" };
  return withTenant(prisma, params.tenantId, async (tx) => {
    const ticket = await tx.supportTicket.findUnique({ where: { id: params.ticketId } });
    if (!ticket) return { ok: false, motivo: "NAO_ENCONTRADO" };
    if (ticket.status !== "FECHADO" && ticket.status !== "RESOLVIDO") return { ok: false, motivo: "TICKET_NAO_FECHADO" };
    await tx.supportTicket.update({ where: { id: ticket.id }, data: { avaliacaoNota: params.nota, avaliacaoComentario: params.comentario ?? null } });
    const actorType = params.actorType ?? "SISTEMA";
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType,
      userId: actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? (actorType === "SISTEMA" ? "avaliação de cliente" : null),
      acao: "SUPPORT_TICKET_AVALIADO",
      entidade: "SupportTicket",
      entidadeId: ticket.id,
      resultado: "ok",
      detalhe: { nota: params.nota },
    });
    return { ok: true };
  });
}

export async function listarTickets(prisma: PrismaClient, tenantId: string, params?: { status?: SupportTicketStatus }) {
  return withTenant(prisma, tenantId, (tx) => tx.supportTicket.findMany({ where: { tenantId, ...(params?.status ? { status: params.status } : {}) }, orderBy: { createdAt: "desc" } }));
}

export async function buscarTicket(prisma: PrismaClient, tenantId: string, ticketId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.supportTicket.findUnique({ where: { id: ticketId }, include: { mensagens: { orderBy: { createdAt: "asc" } }, lead: true, responsavel: true } }),
  );
}
