import { z } from "zod";
import { registrarJobType, withTenant, FalhaJob, diasDesdeUltimaAtividade } from "@partiumarrocos/db";

/**
 * Repescagem estruturada (PM-NIGHT-RUN-01, Etapa 3, §24) — usa o Job Engine
 * (T5) genérico, NÃO copia `reengage.ts` do KeroSolar. Pipeline real:
 *
 *   regra (elegibilidade determinística)
 *   → job agendado (Job Engine, `scheduledFor`)
 *   → reavalia elegibilidade NA HORA de rodar (nunca confia só na
 *     avaliação de quando foi agendado — o lead pode ter avançado/fechado
 *     nesse meio tempo)
 *   → sinaliza (Note tipo REPESCAGEM + Task tipo FOLLOWUP)
 *   → decisão humana ou Yalla (via tarefa.criar/Tool Broker) decide o que
 *     fazer com o sinal
 *
 * Deliberadamente NÃO inclui "Yalla compõe e envia mensagem sozinho" — a
 * autorização descreve esse passo final ("Yalla compõe/prepara mensagem →
 * policy → envio"), mas compor+enviar autonomamente seria ampliar a
 * autonomia do agente numa ação de contato com o cliente sem revisão desta
 * rodada específica ter testado esse caminho — registrado como limitação
 * honesta no relatório de fechamento, não escondido. Este job entrega a
 * FUNDAÇÃO real e testável (regra→elegibilidade→job→sinal), que é o que a
 * seção 9/10 do comando pede pra Lead Scoring/NBA também: fundação
 * explicável, não autonomia irrestrita.
 */

const payloadSchema = z.object({ leadId: z.string().min(1) });

const DIAS_ELEGIVEL = 3;

registrarJobType({
  type: "lead.repescar_elegibilidade",
  descricao:
    "Reavalia se um lead esfriado ainda está elegível para repescagem e, se sim, sinaliza (Note + Task) para decisão humana/Yalla — nunca envia mensagem sozinho.",
  payloadSchema,
  timeoutMs: 10_000,
  maxAttempts: 3,
  backoffBaseMs: 5_000,
  backoffMaxMs: 60_000,
  priorityPadrao: -5, // baixa prioridade de propósito — nunca compete com mensagem de cliente (prioridade 10) nem ação operacional
  handler: async (prisma, ctx, payload) => {
    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: payload.leadId }, include: { stage: true } });
      if (!lead) throw new FalhaJob("lead não encontrado", "PERMANENTE");

      if (lead.status !== "ABERTO" || lead.stage.isWon || lead.stage.isLost) {
        return { elegivel: false, motivo: "lead não está mais aberto — avançou ou fechou desde o agendamento" };
      }

      const [ultimaNote, ultimaTask, ultimaConversa] = await Promise.all([
        tx.note.findFirst({ where: { tenantId: ctx.tenantId, leadId: lead.id }, orderBy: { createdAt: "desc" } }),
        tx.task.findFirst({ where: { tenantId: ctx.tenantId, leadId: lead.id }, orderBy: { createdAt: "desc" } }),
        tx.conversation.findFirst({ where: { tenantId: ctx.tenantId, contactId: lead.contactId }, orderBy: { lastMessageAt: "desc" } }),
      ]);
      const diasParados = diasDesdeUltimaAtividade([ultimaNote?.createdAt, ultimaTask?.createdAt, ultimaConversa?.lastMessageAt, lead.createdAt]);

      if (diasParados < DIAS_ELEGIVEL) {
        return { elegivel: false, motivo: `atividade recente (${diasParados} dia(s) atrás) — não está mais elegível` };
      }

      const tarefaPendenteExiste = await tx.task.findFirst({
        where: { tenantId: ctx.tenantId, leadId: lead.id, concluida: false, tipo: "FOLLOWUP" },
      });
      if (tarefaPendenteExiste) {
        return { elegivel: false, motivo: "já existe um follow-up pendente para este lead" };
      }

      await tx.note.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: lead.id,
          tipo: "REPESCAGEM",
          conteudo: `[Sistema · Repescagem] Sem atividade há ${diasParados} dia(s) — elegível para retomada de contato.`,
        },
      });
      const task = await tx.task.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: lead.id,
          responsavelId: lead.responsavelId,
          titulo: `Retomar contato — sem atividade há ${diasParados} dia(s)`,
          tipo: "FOLLOWUP",
        },
      });

      return { elegivel: true, diasParados, taskId: task.id };
    });
  },
});
