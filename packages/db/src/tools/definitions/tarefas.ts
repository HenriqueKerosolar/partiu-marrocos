import { z } from "zod";
import { withTenant } from "../../tenant-db";
import { registrarEvento } from "../../audit";
import { defineTool, ToolNotFoundError } from "../types";

/**
 * Tool de Task/follow-up — Camada 1 (cobre também "agendar retorno" da
 * Camada 2, T3 §13: agendar é só criar uma Task com `dataHora` — não um
 * handler separado). `titulo` grava a descrição; o `motivo` vai só no
 * detalhe do Audit Log (T3 §10 já exige "quem executou/tool/tenant/objeto/
 * timestamp/resultado" — motivo é contexto adicional de auditoria, não
 * precisa duplicar campo no Task).
 *
 * Timezone (T3 §12): `dataHora`, quando informado, é interpretado e salvo
 * em UTC (mesmo padrão `DateTime` do Prisma/Postgres em todo o schema) —
 * timezone por tenant/operador é F3, fora de escopo aqui. Documentado
 * explicitamente porque a autorização pediu isso enquanto F3 não existir.
 */

const AGORA_TOLERANCIA_MS = 5 * 60 * 1000; // 5min de tolerância pra latência de rede/relógio
const LIMITE_FUTURO_MS = 2 * 365 * 24 * 60 * 60 * 1000; // 2 anos — evita "datas absurdas" (T3 §12)

const tarefaInput = z.object({
  descricao: z.string().min(1).max(300),
  motivo: z.string().min(1).max(500),
  dataHora: z
    .string()
    .datetime({ message: "dataHora precisa ser ISO 8601 (ex.: 2026-09-20T14:00:00Z)" })
    .optional()
    .refine((v) => !v || new Date(v).getTime() >= Date.now() - AGORA_TOLERANCIA_MS, { message: "dataHora não pode estar no passado" })
    .refine((v) => !v || new Date(v).getTime() <= Date.now() + LIMITE_FUTURO_MS, { message: "dataHora além do limite aceito (2 anos)" }),
});
const tarefaOutput = z.object({ criado: z.boolean(), taskId: z.string() });

export const tarefaCriarTool = defineTool({
  id: "tarefa.criar",
  nome: "Criar tarefa/follow-up",
  descricao:
    "Cria uma tarefa de follow-up para o lead da conversa atual, com descrição, motivo e data/hora opcional (para 'agendar retorno'). Nunca aceita HTML/script; datas absurdas (passado ou além de 2 anos) são rejeitadas.",
  capability: "tarefa.criar",
  risk: "SAFE_WRITE",
  inputSchema: tarefaInput,
  outputSchema: tarefaOutput,
  sideEffects: true,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: true,
  async handler(prisma, ctx, input) {
    if (!ctx.leadId) throw new ToolNotFoundError("Nenhum lead associado a esta conversa — tarefa de follow-up precisa de um lead.");
    const descricaoSegura = input.descricao.replace(/<[^>]*>/g, "").trim();
    if (!descricaoSegura) throw new ToolNotFoundError("Descrição vazia após sanitização.");

    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: ctx.leadId! } });
      if (!lead || lead.tenantId !== ctx.tenantId) throw new ToolNotFoundError("Lead não encontrado para esta conversa.");

      const task = await tx.task.create({
        data: { tenantId: ctx.tenantId, leadId: lead.id, titulo: descricaoSegura, tipo: "FOLLOWUP", vencimento: input.dataHora ? new Date(input.dataHora) : null },
      });
      await registrarEvento(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorLabel: ctx.actorLabel ?? ctx.agent,
        acao: "TASK_CRIADA_POR_AGENTE",
        entidade: "Task",
        entidadeId: task.id,
        resultado: "ok",
        detalhe: { motivo: input.motivo, temVencimento: !!input.dataHora },
      });
      return { criado: true, taskId: task.id };
    });
  },
});
