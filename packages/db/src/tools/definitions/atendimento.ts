import { z } from "zod";
import { withTenant } from "../../tenant-db";
import { registrarEvento } from "../../audit";
import { defineTool, ToolNotFoundError } from "../types";

/**
 * Tool de handoff humano — Camada 2 (T3 §16). O resumo estruturado é
 * montado pelo HANDLER a partir de dado confiável do banco (lead/contato/
 * notas recentes) — nunca a partir de texto livre do modelo. Campo
 * desconhecido vira `null` explícito ("marcar desconhecido quando
 * necessário", T3 §16), nunca inventado. Desliga `Conversation.aiEnabled`
 * (campo já existente, exatamente para isto) — Yalla para de responder
 * automaticamente nesta conversa até um humano reativar.
 */

const encaminharInput = z.object({ motivo: z.string().min(1).max(500) });

const resumoSchema = z.object({
  cliente: z.string().nullable(),
  idioma: z.string().nullable(),
  intencao: z.string().nullable(),
  roteiroOuPacote: z.string().nullable(),
  datas: z.string().nullable(),
  passageiros: z.number().nullable(),
  preferencias: z.string().nullable(),
  pendencias: z.array(z.string()),
  motivo: z.string(),
});
const encaminharOutput = z.object({ encaminhado: z.boolean(), noteId: z.string().optional(), resumo: resumoSchema });

export const atendimentoEncaminharHumanoTool = defineTool({
  id: "atendimento.encaminhar_humano",
  nome: "Encaminhar para atendimento humano",
  descricao:
    "Encaminha a conversa atual para um humano: desliga a resposta automática do Yalla e registra um resumo estruturado (cliente, idioma, intenção, roteiro, datas, passageiros, preferências, pendências, motivo) a partir dos dados já confiáveis do CRM — nunca inventa dado ausente.",
  capability: "atendimento.encaminhar_humano",
  risk: "SAFE_WRITE",
  inputSchema: encaminharInput,
  outputSchema: encaminharOutput,
  sideEffects: true,
  requiresGate: false,
  timeoutMs: 8_000,
  idempotent: true,
  async handler(prisma, ctx, input) {
    if (!ctx.conversationId) throw new ToolNotFoundError("Nenhuma conversa em andamento para encaminhar.");

    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const conversation = await tx.conversation.findUnique({ where: { id: ctx.conversationId! }, include: { contact: true } });
      if (!conversation || conversation.tenantId !== ctx.tenantId) throw new ToolNotFoundError("Conversa não encontrada.");

      const lead = ctx.leadId ? await tx.lead.findUnique({ where: { id: ctx.leadId } }) : null;
      const prefs = (lead?.preferenciasCliente as Record<string, unknown> | null) ?? null;

      const pendenciasNotes = ctx.leadId
        ? await tx.note.findMany({ where: { tenantId: ctx.tenantId, leadId: ctx.leadId, conteudo: { contains: "[Yalla · Pendência]" } }, orderBy: { createdAt: "desc" }, take: 5 })
        : [];

      const resumo = {
        cliente: conversation.contact.nome ?? null,
        idioma: (prefs?.idioma as string | undefined) ?? null,
        intencao: (prefs?.preferenciaRoteiro as string | undefined) ?? null,
        roteiroOuPacote: (prefs?.preferenciaRoteiro as string | undefined) ?? null,
        datas: (prefs?.datasDesejadas as string | undefined) ?? null,
        passageiros: (prefs?.quantidadePassageiros as number | undefined) ?? null,
        preferencias: (prefs?.observacoes as string | undefined) ?? null,
        pendencias: pendenciasNotes.map((n) => n.conteudo),
        motivo: input.motivo,
      };

      await tx.conversation.update({ where: { id: conversation.id }, data: { aiEnabled: false } });

      const note = await tx.note.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: ctx.leadId ?? null,
          contactId: ctx.leadId ? null : conversation.contactId,
          tipo: "HANDOFF",
          conteudo: `[Yalla · Encaminhado para humano] Motivo: ${input.motivo}. Resumo: ${JSON.stringify(resumo)}`,
        },
      });

      await registrarEvento(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorLabel: ctx.actorLabel ?? ctx.agent,
        acao: "ATENDIMENTO_ENCAMINHADO_HUMANO",
        entidade: "Conversation",
        entidadeId: conversation.id,
        resultado: "ok",
        detalhe: { motivo: input.motivo },
      });

      return { encaminhado: true, noteId: note.id, resumo };
    });
  },
});
