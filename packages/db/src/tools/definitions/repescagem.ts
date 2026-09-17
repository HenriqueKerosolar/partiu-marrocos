import { z } from "zod";
import { withTenant } from "../../tenant-db";
import { registrarEvento } from "../../audit";
import { submeterJob } from "../../jobs/engine";
import { defineTool, ToolNotFoundError } from "../types";

/**
 * Ponto de entrada para agendar a reavaliação de repescagem de um lead
 * (PM-NIGHT-RUN-01, Etapa 3, §24). Esta tool só ENFILEIRA o job
 * `lead.repescar_elegibilidade` (definido em
 * `apps/web/src/lib/jobs/definitions/lead-repescar.ts`) — não decide
 * elegibilidade aqui (isso é reavaliado só quando o job efetivamente roda,
 * pra nunca confiar numa condição que pode ter mudado no meio tempo) e não
 * compõe nem envia nenhuma mensagem. É seguro o Yalla ter esta capability
 * porque o pior caso de uso indevido é só "checar de novo mais tarde", sem
 * nenhum efeito colateral externo — por isso `requiresGate: false`, igual
 * a `tarefa.criar`.
 *
 * DIAS_ATE_REAVALIACAO precisa ficar em sincronia com `DIAS_ELEGIVEL` em
 * `lead-repescar.ts` — duplicado de propósito (packages/db não pode
 * depender de apps/web), documentado aqui pra não divergir silenciosamente.
 */

const DIAS_ATE_REAVALIACAO = 3;

const repescagemInput = z.object({
  motivo: z.string().min(1).max(300),
});
const repescagemOutput = z.object({ agendado: z.boolean(), jobId: z.string(), scheduledFor: z.string() });

export const leadAgendarRepescagemTool = defineTool({
  id: "lead.agendar_repescagem",
  nome: "Agendar reavaliação de repescagem",
  descricao:
    "Agenda uma reavaliação futura de elegibilidade para repescagem do lead da conversa atual — não decide nem envia nada agora, só marca para reverificação.",
  capability: "lead.agendar_repescagem",
  risk: "SAFE_WRITE",
  inputSchema: repescagemInput,
  outputSchema: repescagemOutput,
  sideEffects: true,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: true,
  async handler(prisma, ctx, input) {
    if (!ctx.leadId) throw new ToolNotFoundError("Nenhum lead associado a esta conversa — repescagem precisa de um lead.");

    const lead = await withTenant(prisma, ctx.tenantId, (tx) => tx.lead.findUnique({ where: { id: ctx.leadId! } }));
    if (!lead || lead.tenantId !== ctx.tenantId) throw new ToolNotFoundError("Lead não encontrado para esta conversa.");

    const scheduledFor = new Date(Date.now() + DIAS_ATE_REAVALIACAO * 24 * 60 * 60 * 1000);
    const idempotencyKey = `repescagem-${lead.id}-${scheduledFor.toISOString().slice(0, 10)}`;

    const { job } = await submeterJob(prisma, {
      tenantId: ctx.tenantId,
      type: "lead.repescar_elegibilidade",
      payload: { leadId: lead.id },
      scheduledFor,
      idempotencyKey,
      priority: -5,
      source: "tool.lead.agendar_repescagem",
      actorType: ctx.actorType,
      actorLabel: ctx.actorLabel ?? ctx.agent,
    });

    await withTenant(prisma, ctx.tenantId, (tx) =>
      registrarEvento(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorLabel: ctx.actorLabel ?? ctx.agent,
        acao: "REPESCAGEM_AGENDADA",
        entidade: "Lead",
        entidadeId: lead.id,
        resultado: "ok",
        detalhe: { motivo: input.motivo, scheduledFor: scheduledFor.toISOString(), jobId: job.id },
      }),
    );

    return { agendado: true, jobId: job.id, scheduledFor: scheduledFor.toISOString() };
  },
});
