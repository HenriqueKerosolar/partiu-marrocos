"use server";

import { revalidatePath } from "next/cache";
import { prisma, abrirTicket, responderTicket, moverStatusTicket, type SupportTicketCategoria, type SupportTicketStatus } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

export async function abrirTicketAction(formData: FormData): Promise<{ ok?: boolean; error?: string; ticketId?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "ouvidoria.manage");
  const assunto = String(formData.get("assunto") ?? "").trim();
  const mensagemInicial = String(formData.get("mensagemInicial") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "OUTRO") as SupportTicketCategoria;
  if (!assunto || !mensagemInicial) return { error: "Informe assunto e mensagem." };

  const ticket = await abrirTicket(prisma, {
    tenantId: ctx.tenantId!,
    assunto,
    categoria,
    mensagemInicial,
    autorUserId: ctx.user.id,
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath("/ouvidoria");
  return { ok: true, ticketId: ticket.id };
}

export async function responderTicketAction(ticketId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "ouvidoria.manage");
  const corpo = String(formData.get("corpo") ?? "").trim();
  if (!corpo) return { error: "Escreva uma mensagem." };

  const r = await responderTicket(prisma, { tenantId: ctx.tenantId!, ticketId, corpo, autorUserId: ctx.user.id, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/ouvidoria/${ticketId}`);
  return r.ok ? { ok: true } : { error: r.motivo === "TICKET_FECHADO" ? "Este ticket já está fechado." : "Ticket não encontrado." };
}

export async function moverStatusTicketAction(ticketId: string, novoStatus: SupportTicketStatus, resolucao?: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "ouvidoria.manage");
  const r = await moverStatusTicket(prisma, { tenantId: ctx.tenantId!, ticketId, novoStatus, resolucao, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/ouvidoria/${ticketId}`);
  return r.ok ? { ok: true } : { error: "Essa transição de status não é permitida." };
}
