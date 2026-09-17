import { z } from "zod";
import { withTenant } from "../../tenant-db";
import { defineTool, ToolNotFoundError } from "../types";

/**
 * Tool de Note — Camada 1. Cobre os itens "registrar interesse/intenção/
 * preferência" (T3 §6) e "registrar pendência de informação faltante" (T3
 * §17) via uma `categoria` discriminadora — não 4 handlers quase idênticos
 * ("não é obrigatório criar nove handlers separados", T3 §6). A categoria
 * grava tanto no prefixo do texto (compatibilidade visual com notas
 * antigas) quanto na coluna `Note.tipo` de verdade (CRM Evolution 01,
 * PM-NIGHT-RUN-01 Etapa 3 — generalização identificada na matriz de
 * PM-CRM-FIN-ARCH-01). Sempre `ctx.leadId`/`ctx.contactId` (da conversa
 * atual) — nunca um id do modelo.
 */

const CATEGORIA_PREFIXO: Record<string, string> = {
  OBSERVACAO: "[Yalla]",
  INTERESSE: "[Yalla · Interesse]",
  INTENCAO: "[Yalla · Intenção]",
  PREFERENCIA: "[Yalla · Preferência]",
  INFERENCIA: "[Inferência do Yalla]",
  PENDENCIA: "[Yalla · Pendência]",
};

const notaInput = z.object({
  categoria: z.enum(["OBSERVACAO", "INTERESSE", "INTENCAO", "PREFERENCIA", "INFERENCIA", "PENDENCIA"]),
  conteudo: z.string().min(1).max(1000),
});
const notaOutput = z.object({ registrado: z.boolean(), noteId: z.string().optional() });

export const notaRegistrarTool = defineTool({
  id: "nota.registrar",
  nome: "Registrar nota",
  descricao:
    "Registra uma nota no histórico comercial do lead/contato da conversa atual — observação, interesse, intenção, preferência, inferência do próprio Yalla, ou uma pendência de informação ainda não obtida. Nunca aceita HTML/script; texto simples até 1000 caracteres.",
  capability: "nota.registrar",
  risk: "SAFE_WRITE",
  inputSchema: notaInput,
  outputSchema: notaOutput,
  sideEffects: true,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: true,
  async handler(prisma, ctx, input) {
    if (!ctx.leadId && !ctx.contactId) throw new ToolNotFoundError("Nenhum lead ou contato associado a esta conversa.");
    // Texto simples: remove qualquer marcação de tag HTML/script antes de gravar — a nota é sempre exibida como texto puro no CRM, mas nunca vale a pena persistir markup potencialmente perigoso.
    const conteudoSeguro = input.conteudo.replace(/<[^>]*>/g, "").trim();
    if (!conteudoSeguro) return { registrado: false };

    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const note = await tx.note.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: ctx.leadId ?? null,
          contactId: ctx.leadId ? null : (ctx.contactId ?? null),
          tipo: input.categoria,
          conteudo: `${CATEGORIA_PREFIXO[input.categoria]} ${conteudoSeguro}`,
        },
      });
      return { registrado: true, noteId: note.id };
    });
  },
});
