import { z } from "zod";
import { withTenant } from "../../tenant-db";
import { defineTool, ToolNotFoundError } from "../types";

/** Tools de Contact — Camada 1. Sempre `ctx.contactId` (da conversa atual), nunca um id do modelo. */

const consultaOutput = z.object({
  encontrado: z.boolean(),
  contato: z
    .object({
      id: z.string(),
      nome: z.string(),
      telefone: z.string().nullable(),
      email: z.string().nullable(),
      origem: z.string().nullable(),
    })
    .optional(),
});

export const contatoConsultarTool = defineTool({
  id: "contato.consultar",
  nome: "Consultar contato",
  descricao: "Consulta os dados do contato associado à conversa atual (nome, telefone, email). Não aceita id — sempre o contato da conversa em andamento.",
  capability: "contato.consultar",
  risk: "READ_ONLY",
  inputSchema: z.object({}),
  outputSchema: consultaOutput,
  sideEffects: false,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: false,
  async handler(prisma, ctx) {
    if (!ctx.contactId) return { encontrado: false };
    const contato = await withTenant(prisma, ctx.tenantId, (tx) => tx.contact.findUnique({ where: { id: ctx.contactId! } }));
    if (!contato || contato.tenantId !== ctx.tenantId) return { encontrado: false };
    return { encontrado: true, contato: { id: contato.id, nome: contato.nome, telefone: contato.telefone, email: contato.email, origem: contato.origem } };
  },
});

// Allowlist explícita (T3 §11) — nunca aceita o objeto Contact inteiro. Cada
// campo é opcional (o cliente pode informar só um de cada vez); nenhum
// campo interno (id/tenantId/whatsappId/timestamps) é aceitável aqui.
const atualizarDadosInput = z.object({
  nome: z.string().min(1).max(200).optional(),
  telefone: z.string().min(6).max(30).optional(),
  email: z.string().email().max(200).optional(),
});
const atualizarDadosOutput = z.object({ atualizado: z.boolean() });

export const contatoAtualizarDadosTool = defineTool({
  id: "contato.atualizar_dados_informados",
  nome: "Atualizar dados do contato",
  descricao: "Atualiza nome/telefone/email do contato da conversa atual, quando o próprio cliente informa esses dados explicitamente. Só estes 3 campos — nunca um objeto arbitrário.",
  capability: "contato.atualizar_dados_informados",
  risk: "SAFE_WRITE",
  inputSchema: atualizarDadosInput,
  outputSchema: atualizarDadosOutput,
  sideEffects: true,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: true,
  async handler(prisma, ctx, input) {
    if (!ctx.contactId) throw new ToolNotFoundError("Nenhum contato associado a esta conversa.");
    if (Object.keys(input).length === 0) return { atualizado: false };
    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const contato = await tx.contact.findUnique({ where: { id: ctx.contactId! } });
      if (!contato || contato.tenantId !== ctx.tenantId) throw new ToolNotFoundError("Contato não encontrado para esta conversa.");
      await tx.contact.update({ where: { id: contato.id }, data: input });
      return { atualizado: true };
    });
  },
});
