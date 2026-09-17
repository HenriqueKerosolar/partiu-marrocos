"use server";

import { revalidatePath } from "next/cache";
import { prisma, withTenant, submeterJob } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import "@/lib/jobs"; // registra lead.repescar_elegibilidade antes do submeterJob abaixo

/** Cria um lead novo — cria o contato junto se ainda não existir (por telefone). */
export async function criarLead(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "leads.manage");

  const nome = String(formData.get("nome") ?? "").trim();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const origem = String(formData.get("origem") ?? "").trim();
  const valorRaw = String(formData.get("valor") ?? "").trim();
  const stageId = String(formData.get("stageId") ?? "").trim();

  if (!nome || !stageId) return { error: "Preencha ao menos o nome e a etapa." };

  await withTenant(prisma, ctx.tenantId!, async (tx) => {
    const stage = await tx.stage.findUniqueOrThrow({ where: { id: stageId } });

    let contact = telefone
      ? await tx.contact.findFirst({ where: { tenantId: ctx.tenantId!, telefone } })
      : null;
    if (!contact) {
      contact = await tx.contact.create({
        data: { tenantId: ctx.tenantId!, nome, telefone: telefone || null, email: email || null, origem: origem || null },
      });
    }

    await tx.lead.create({
      data: {
        tenantId: ctx.tenantId!,
        contactId: contact.id,
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        responsavelId: ctx.user.id,
        origem: origem || null,
        valor: valorRaw ? Number(valorRaw) : null,
      },
    });
  });

  revalidatePath("/leads");
  return { ok: true };
}

/**
 * Move um lead para outra etapa do mesmo pipeline. `motivoPerda` só é
 * gravado quando a etapa de destino é terminal de perda (`isLost`) — nunca
 * sobrescreve/limpa um motivo já registrado se o parâmetro vier vazio
 * numa etapa não-perdida (CRM Evolution 01, PM-NIGHT-RUN-01 Etapa 3).
 */
export async function moverLeadEtapa(leadId: string, novoStageId: string, motivoPerda?: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "leads.manage");

  const resultado = await withTenant(prisma, ctx.tenantId!, async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    const novaEtapa = await tx.stage.findUnique({ where: { id: novoStageId } });
    if (!lead || !novaEtapa || novaEtapa.pipelineId !== lead.pipelineId) {
      return { error: "Etapa inválida para este lead." };
    }

    const motivoPerdaSeguro = motivoPerda?.trim().replace(/<[^>]*>/g, "").slice(0, 500) || null;

    await tx.lead.update({
      where: { id: leadId },
      data: {
        stageId: novoStageId,
        status: novaEtapa.isWon ? "GANHO" : novaEtapa.isLost ? "PERDIDO" : "ABERTO",
        ...(novaEtapa.isLost ? { motivoPerda: motivoPerdaSeguro } : {}),
      },
    });
    await tx.note.create({
      data: {
        tenantId: ctx.tenantId!,
        leadId,
        autorId: ctx.user.id,
        tipo: "STAGE_CHANGE",
        conteudo: novaEtapa.isLost && motivoPerdaSeguro ? `Movido para "${novaEtapa.nome}". Motivo: ${motivoPerdaSeguro}` : `Movido para "${novaEtapa.nome}"`,
      },
    });
    return { ok: true as const };
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return resultado;
}

/** Alterna a flag de prioridade do lead — sem efeito colateral além do próprio flag (não cria Note, não é uma decisão de negócio auditável). */
export async function alternarPrioridadeLead(leadId: string, prioridade: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "leads.manage");

  await withTenant(prisma, ctx.tenantId!, (tx) => tx.lead.update({ where: { id: leadId }, data: { prioridade } }));

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

/** Marca/desmarca uma Task como concluída — ação simples do detalhe do lead. */
export async function alternarTaskConcluida(taskId: string, concluida: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "leads.manage");

  const task = await withTenant(prisma, ctx.tenantId!, (tx) => tx.task.update({ where: { id: taskId }, data: { concluida } }));

  revalidatePath("/leads");
  if (task.leadId) revalidatePath(`/leads/${task.leadId}`);
  return { ok: true };
}

const DIAS_ATE_REAVALIACAO_REPESCAGEM = 3; // precisa ficar em sincronia com DIAS_ELEGIVEL em lib/jobs/definitions/lead-repescar.ts

/**
 * Acionamento HUMANO (não-Yalla) do mesmo mecanismo da tool
 * `lead.agendar_repescagem` — só ENFILEIRA a reavaliação futura (Job
 * Engine), nunca decide nem envia nada agora. Mesmo padrão de
 * `cancelarJobAction`/`reenviarJobAction` (actions/jobs.ts): ação
 * administrativa direta sobre o motor, não passa pelo Tool Broker porque
 * quem está agindo é um humano autenticado, não o agente Yalla.
 */
export async function agendarRepescagemLeadAction(leadId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "leads.manage");

  const lead = await withTenant(prisma, ctx.tenantId!, (tx) => tx.lead.findUnique({ where: { id: leadId } }));
  if (!lead) return { error: "Lead não encontrado." };

  const scheduledFor = new Date(Date.now() + DIAS_ATE_REAVALIACAO_REPESCAGEM * 24 * 60 * 60 * 1000);
  await submeterJob(prisma, {
    tenantId: ctx.tenantId!,
    type: "lead.repescar_elegibilidade",
    payload: { leadId },
    scheduledFor,
    idempotencyKey: `repescagem-${leadId}-${scheduledFor.toISOString().slice(0, 10)}`,
    priority: -5,
    source: "acao.leads.agendar_repescagem",
    actorType: "HUMANO",
    userId: ctx.user.id,
    actorLabel: ctx.user.email,
  });

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}
