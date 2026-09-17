import { z } from "zod";
import { withTenant } from "../../tenant-db";
import { registrarEvento } from "../../audit";
import { defineTool, ToolNotFoundError } from "../types";

/**
 * Tools de Lead — Camada 1 (consultar) e Camada 2 (mover_stage,
 * classificar, atualizar_preferencias). Nenhuma delas aceita um `leadId`
 * do modelo: sempre operam sobre `ctx.leadId`, resolvido pelo chamador
 * (yalla.ts) a partir da conversa atual — elimina IDOR por construção (T3
 * §9), não por checagem a mais.
 */

const leadConsultaOutput = z.object({
  encontrado: z.boolean(),
  lead: z
    .object({
      id: z.string(),
      status: z.string(),
      etapa: z.string(),
      etapaOrdem: z.number(),
      pipeline: z.string(),
      valor: z.number().nullable(),
      moeda: z.string().nullable(),
      origem: z.string().nullable(),
      preferenciasCliente: z.record(z.unknown()).nullable(),
    })
    .optional(),
});

export const leadConsultarTool = defineTool({
  id: "lead.consultar",
  nome: "Consultar lead",
  descricao: "Consulta os dados do lead associado à conversa atual (status, etapa do funil, valor, preferências já informadas). Não aceita id — sempre o lead da conversa em andamento.",
  capability: "lead.consultar",
  risk: "READ_ONLY",
  inputSchema: z.object({}),
  outputSchema: leadConsultaOutput,
  sideEffects: false,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: false,
  async handler(prisma, ctx) {
    if (!ctx.leadId) return { encontrado: false };
    const lead = await withTenant(prisma, ctx.tenantId, (tx) =>
      tx.lead.findUnique({ where: { id: ctx.leadId! }, include: { stage: true, pipeline: true } }),
    );
    if (!lead || lead.tenantId !== ctx.tenantId) return { encontrado: false };
    return {
      encontrado: true,
      lead: {
        id: lead.id,
        status: lead.status,
        etapa: lead.stage.nome,
        etapaOrdem: lead.stage.ordem,
        pipeline: lead.pipeline.nome,
        valor: lead.valor,
        moeda: lead.moeda,
        origem: lead.origem,
        preferenciasCliente: (lead.preferenciasCliente as Record<string, unknown> | null) ?? null,
      },
    };
  },
});

const moverStageInput = z.object({
  motivo: z.string().min(1).max(500),
});
const moverStageOutput = z.object({
  moveu: z.boolean(),
  etapaAnterior: z.string(),
  etapaNova: z.string().nullable(),
  motivoRecusa: z.string().nullable(),
});

export const leadMoverStageTool = defineTool({
  id: "lead.mover_stage",
  nome: "Avançar lead uma etapa",
  descricao:
    "Avança o lead da conversa atual exatamente UMA etapa à frente no funil, quando a regra for inequívoca. Nunca aceita um id de etapa de destino — o destino é sempre a próxima etapa em ordem do mesmo pipeline. Nunca move para uma etapa terminal (ganho/perdido) — isso exige decisão humana.",
  capability: "lead.mover_stage",
  risk: "SAFE_WRITE",
  inputSchema: moverStageInput,
  outputSchema: moverStageOutput,
  sideEffects: true,
  requiresGate: false,
  timeoutMs: 8_000,
  idempotent: true,
  async handler(prisma, ctx, input) {
    if (!ctx.leadId) throw new ToolNotFoundError("Nenhum lead associado a esta conversa.");

    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: ctx.leadId! }, include: { stage: true } });
      if (!lead || lead.tenantId !== ctx.tenantId) throw new ToolNotFoundError("Lead não encontrado para esta conversa.");

      const proximaEtapa = await tx.stage.findFirst({
        where: { tenantId: ctx.tenantId, pipelineId: lead.pipelineId, ordem: lead.stage.ordem + 1 },
      });

      if (!proximaEtapa) {
        return { moveu: false, etapaAnterior: lead.stage.nome, etapaNova: null, motivoRecusa: "Não há próxima etapa no funil." };
      }
      if (proximaEtapa.isWon || proximaEtapa.isLost) {
        return {
          moveu: false,
          etapaAnterior: lead.stage.nome,
          etapaNova: null,
          motivoRecusa: `A próxima etapa ("${proximaEtapa.nome}") é terminal (ganho/perdido) — exige decisão humana, não pode ser movida automaticamente.`,
        };
      }

      // Atômico: mover etapa + registrar Note na mesma transação (T3 §26) — mesmo padrão já usado pela versão humana desta ação (apps/web/src/app/actions/leads.ts::moverLeadEtapa).
      await tx.lead.update({ where: { id: lead.id }, data: { stageId: proximaEtapa.id } });
      await tx.note.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: lead.id,
          tipo: "STAGE_CHANGE",
          conteudo: `[Yalla] Avançou de "${lead.stage.nome}" para "${proximaEtapa.nome}". Motivo: ${input.motivo}`,
        },
      });
      await registrarEvento(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorLabel: ctx.actorLabel ?? ctx.agent,
        acao: "LEAD_STAGE_AVANCADO",
        entidade: "Lead",
        entidadeId: lead.id,
        resultado: "ok",
        detalhe: { de: lead.stage.nome, para: proximaEtapa.nome },
      });

      return { moveu: true, etapaAnterior: lead.stage.nome, etapaNova: proximaEtapa.nome, motivoRecusa: null };
    });
  },
});

const classificarInput = z.object({
  classificacao: z.enum(["QUENTE", "MORNO", "FRIO"]),
  justificativa: z.string().min(1).max(500),
});
const classificarOutput = z.object({ registrado: z.boolean(), noteId: z.string() });

export const leadClassificarTool = defineTool({
  id: "lead.classificar",
  nome: "Classificar lead (inferência)",
  descricao:
    "Registra uma classificação INFERIDA pelo Yalla (quente/morno/frio) sobre o lead da conversa atual, com justificativa. Isso é uma inferência do agente, não um fato declarado pelo cliente — nunca sobrescreve dado cadastral.",
  capability: "lead.classificar",
  risk: "SAFE_WRITE",
  inputSchema: classificarInput,
  outputSchema: classificarOutput,
  sideEffects: true,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: true,
  async handler(prisma, ctx, input) {
    if (!ctx.leadId) throw new ToolNotFoundError("Nenhum lead associado a esta conversa.");
    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: ctx.leadId! } });
      if (!lead || lead.tenantId !== ctx.tenantId) throw new ToolNotFoundError("Lead não encontrado para esta conversa.");

      const note = await tx.note.create({
        data: { tenantId: ctx.tenantId, leadId: lead.id, tipo: "INFERENCIA", conteudo: `[Inferência do Yalla] Classificação: ${input.classificacao}. ${input.justificativa}` },
      });
      return { registrado: true, noteId: note.id };
    });
  },
});

const preferenciasAllowlist = z.object({
  datasDesejadas: z.string().max(200).optional(),
  quantidadePassageiros: z.number().int().positive().max(100).optional(),
  preferenciaRoteiro: z.string().max(500).optional(),
  orcamentoInformado: z.string().max(200).optional(),
  idioma: z.string().max(50).optional(),
  observacoes: z.string().max(1000).optional(),
});
const preferenciasOutput = z.object({ atualizado: z.boolean() });

export const leadAtualizarPreferenciasTool = defineTool({
  id: "lead.atualizar_preferencias",
  nome: "Atualizar preferências de viagem do lead",
  descricao:
    "Grava dados de viagem EXPLICITAMENTE informados pelo cliente para o lead da conversa atual (datas desejadas, nº de passageiros, preferência de roteiro, orçamento informado, idioma, observações). Só os campos desta lista — nunca um objeto arbitrário.",
  capability: "lead.atualizar_preferencias",
  risk: "SAFE_WRITE",
  inputSchema: preferenciasAllowlist,
  outputSchema: preferenciasOutput,
  sideEffects: true,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: true,
  async handler(prisma, ctx, input) {
    if (!ctx.leadId) throw new ToolNotFoundError("Nenhum lead associado a esta conversa.");
    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: ctx.leadId! } });
      if (!lead || lead.tenantId !== ctx.tenantId) throw new ToolNotFoundError("Lead não encontrado para esta conversa.");

      const existentes = (lead.preferenciasCliente as Record<string, unknown> | null) ?? {};
      // merge campo a campo (allowlist já garantida pelo zod acima) — nunca substitui o objeto inteiro, só os campos enviados desta vez.
      const mescladas = { ...existentes, ...input };

      await tx.lead.update({ where: { id: lead.id }, data: { preferenciasCliente: mescladas } });
      return { atualizado: true };
    });
  },
});
