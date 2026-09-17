import { z } from "zod";
import { withTenant } from "../../tenant-db";
import { defineTool } from "../types";

/** Tool de Conversation/Message — Camada 1. Sempre `ctx.conversationId`, nunca um id do modelo. */

const historicoOutput = z.object({
  mensagens: z.array(
    z.object({
      direcao: z.enum(["ENTRADA", "SAIDA"]),
      remetente: z.enum(["CONTATO", "HUMANO", "IA"]),
      conteudo: z.string(),
      criadaEm: z.string(),
    }),
  ),
});

export const conversaConsultarHistoricoTool = defineTool({
  id: "conversa.consultar_historico",
  nome: "Consultar histórico da conversa",
  descricao: "Consulta as últimas mensagens da conversa atual (padrão: 20). Não aceita id de conversa — sempre a conversa em andamento.",
  capability: "conversa.consultar_historico",
  risk: "READ_ONLY",
  inputSchema: z.object({ limite: z.number().int().positive().max(50).optional() }),
  outputSchema: historicoOutput,
  sideEffects: false,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: false,
  async handler(prisma, ctx, input) {
    if (!ctx.conversationId) return { mensagens: [] };
    const limite = input.limite ?? 20;
    const mensagens = await withTenant(prisma, ctx.tenantId, (tx) =>
      tx.message.findMany({
        where: { tenantId: ctx.tenantId, conversationId: ctx.conversationId! },
        orderBy: { createdAt: "desc" },
        take: limite,
      }),
    );
    return {
      mensagens: mensagens
        .slice()
        .reverse()
        .map((m) => ({ direcao: m.direction, remetente: m.senderType, conteudo: m.conteudo, criadaEm: m.createdAt.toISOString() })),
    };
  },
});
