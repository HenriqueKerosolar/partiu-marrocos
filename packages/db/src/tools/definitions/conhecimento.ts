import { z } from "zod";
import { withTenant } from "../../tenant-db";
import { defineTool } from "../types";

/**
 * Base de Conhecimento da Yalla — router entre resposta fixa curada
 * (STATIC_KNOWLEDGE/OFFICIAL_DYNAMIC, `respostaBase` pronta) e dado dinâmico
 * (TRIP_DYNAMIC/REALTIME_CONTEXT, que NUNCA tem resposta fixa gravada — só
 * aponta qual outra tool real a Yalla deve chamar em seguida via
 * `toolIdSugerido`). Esta tool nunca tenta responder ela mesma um dado
 * dinâmico — isso é o que evita ela virar uma segunda fonte de invenção.
 *
 * Escala de busca: dezenas de entradas por tenant — busca tudo e pontua em
 * memória (sem tsvector/GIN); revisar se/quando crescer pra centenas.
 */

const entradaOutput = z.object({
  intencao: z.string(),
  answerType: z.enum(["STATIC_KNOWLEDGE", "OFFICIAL_DYNAMIC", "TRIP_DYNAMIC", "REALTIME_CONTEXT"]),
  respostaBase: z.string().nullable(),
  fonte: z.string().nullable(),
  ultimaVerificacao: z.string().nullable(),
  desatualizado: z.boolean(),
  riskLevel: z.enum(["BAIXO", "MEDIO", "ALTO"]),
  requerTool: z.boolean(),
  toolIdSugerido: z.string().nullable(),
  politicaEscalonamento: z.string().nullable(),
  fallback: z.string().nullable(),
});

const conhecimentoConsultarOutput = z.object({
  encontrado: z.boolean(),
  resposta: entradaOutput.nullable(),
});

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // remove pontuação
    .trim();
}

function tokenizar(texto: string): string[] {
  return normalizar(texto)
    .split(/\s+/)
    .filter((t) => t.length > 2); // ignora palavras muito curtas (artigos, preposições)
}

const LIMIAR_MINIMO = 1; // ao menos 1 keyword batendo, ou pontuação equivalente por overlap de variante

function pontuar(perguntaTokens: string[], entrada: { pergunta: string; variantes: string[]; keywords: string[] }): number {
  const perguntaSet = new Set(perguntaTokens);
  let score = 0;

  // Keyword explícita batendo é o sinal mais forte.
  for (const kw of entrada.keywords) {
    if (perguntaSet.has(normalizar(kw))) score += 3;
  }

  // Overlap de tokens com a pergunta canônica e as variantes.
  for (const variante of [entrada.pergunta, ...entrada.variantes]) {
    const varianteTokens = tokenizar(variante);
    if (varianteTokens.length === 0) continue;
    const comuns = varianteTokens.filter((t) => perguntaSet.has(t)).length;
    const overlap = comuns / varianteTokens.length;
    if (overlap >= 0.4) score += 1 + overlap;
  }

  return score;
}

export const conhecimentoConsultarTool = defineTool({
  id: "conhecimento.consultar",
  nome: "Consultar base de conhecimento da Yalla",
  descricao:
    "Consulta a base de conhecimento curada (documentação, dinheiro, cultura, roteiro, GPS, emergência) antes de responder perguntas gerais sobre a viagem/país — nunca responder de memória própria sobre visto, câmbio, costumes. Se a entrada encontrada exigir tool (requerTool=true), chame a tool indicada em toolIdSugerido em seguida; nunca invente quando respostaBase vier nulo.",
  capability: "conhecimento.consultar",
  risk: "READ_ONLY",
  inputSchema: z.object({ pergunta: z.string().min(1).max(500) }),
  outputSchema: conhecimentoConsultarOutput,
  sideEffects: false,
  requiresGate: false,
  timeoutMs: 5_000,
  idempotent: false,
  async handler(prisma, ctx, input) {
    const entradas = await withTenant(prisma, ctx.tenantId, (tx) => tx.knowledgeEntry.findMany({ where: { tenantId: ctx.tenantId, ativo: true } }));
    if (entradas.length === 0) return { encontrado: false, resposta: null };

    const perguntaTokens = tokenizar(input.pergunta);

    let melhor: (typeof entradas)[number] | null = null;
    let melhorScore = 0;
    for (const entrada of entradas) {
      const score = pontuar(perguntaTokens, entrada);
      if (score > melhorScore) {
        melhor = entrada;
        melhorScore = score;
      }
    }
    if (!melhor || melhorScore < LIMIAR_MINIMO) return { encontrado: false, resposta: null };

    const desatualizado =
      melhor.answerType === "OFFICIAL_DYNAMIC" &&
      (!melhor.ultimaVerificacao || (melhor.intervaloRevisaoDias != null && diasDesde(melhor.ultimaVerificacao) > melhor.intervaloRevisaoDias));

    const respostaDinamica = melhor.answerType === "TRIP_DYNAMIC" || melhor.answerType === "REALTIME_CONTEXT";

    return {
      encontrado: true,
      resposta: {
        intencao: melhor.intencao,
        answerType: melhor.answerType,
        respostaBase: respostaDinamica ? null : melhor.respostaBase,
        fonte: melhor.fonte,
        ultimaVerificacao: melhor.ultimaVerificacao?.toISOString() ?? null,
        desatualizado,
        riskLevel: melhor.riskLevel,
        requerTool: melhor.requerTool,
        toolIdSugerido: melhor.toolId,
        politicaEscalonamento: melhor.politicaEscalonamento,
        fallback: melhor.fallback,
      },
    };
  },
});

function diasDesde(data: Date): number {
  return Math.floor((Date.now() - data.getTime()) / (24 * 60 * 60 * 1000));
}
