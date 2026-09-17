import type { PrismaClient, ToolRisk, ActorType } from "@prisma/client";
import type { ZodType } from "zod";

/**
 * Tool Broker (T3) — contrato genérico de Tool.
 *
 * Contexto de execução: SEMPRE construído pelo chamador (yalla.ts) a partir
 * de estado confiável do banco (Conversation → Contact/Lead) — nunca de
 * campo algum produzido pelo modelo. Nenhum ToolDefinition abaixo declara
 * `tenantId`/`conversationId`/`leadId`/`contactId` no próprio inputSchema —
 * se o modelo tentar enviar um desses campos mesmo assim, o zod já
 * descarta silenciosamente (schemas não são `.strict()` de propósito: um
 * campo extra nunca deveria travar a chamada, só nunca é lido) e o broker
 * nunca olha pra ele de qualquer forma — o contexto usado é sempre o do
 * parâmetro `ctx`, nunca o do `input`. Testado explicitamente (ver
 * tests/integration/tool-broker.test.ts, "injeção de tenant").
 */
export interface ToolExecutionContext {
  tenantId: string;
  agent: string; // ex.: "yalla" — nunca um User (agentes não logam)
  actorType: ActorType; // "AGENTE" para o Yalla
  actorLabel?: string;
  conversationId?: string;
  contactId?: string;
  leadId?: string;
}

export type ToolResultStatus = "SUCCESS" | "VALIDATION_ERROR" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "TIMEOUT" | "INTERNAL_ERROR";

export interface ToolResult<T = unknown> {
  status: ToolResultStatus;
  data?: T;
  /** Mensagem segura, sempre apresentável ao modelo/cliente — NUNCA stack trace nem detalhe interno. */
  error?: string;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  id: string; // ex.: "lead.consultar" — também é a capability (1 tool = 1 capability, sem agrupamento grosseiro)
  nome: string;
  descricao: string;
  capability: string;
  risk: ToolRisk;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  sideEffects: boolean;
  /** Nenhuma tool desta rodada usa isto (Camada 1/2 não exige Gate) — existe para o Broker já ser arquiteturalmente capaz de encaminhar uma tool de risco pra T1 no futuro, sem reforma. */
  requiresGate: boolean;
  timeoutMs: number;
  /** SAFE_WRITE precisa ser idempotente (mesmo toolCallId nunca duplica o side effect); READ_ONLY não precisa, mas não é proibido. */
  idempotent: boolean;
  handler: (prisma: PrismaClient, ctx: ToolExecutionContext, input: TInput) => Promise<TOutput>;
}

export function defineTool<TInput, TOutput>(def: ToolDefinition<TInput, TOutput>): ToolDefinition<TInput, TOutput> {
  return def;
}

/**
 * Erros tipados que um handler pode lançar pra sinalizar um ToolResultStatus
 * específico (o Broker reconhece e mapeia) — sem isso, qualquer erro vira
 * INTERNAL_ERROR genérico, o que esconderia distinções reais como "esse
 * lead não existe nesta conversa" (NOT_FOUND) de "erro interno de verdade".
 */
export class ToolNotFoundError extends Error {}
export class ToolConflictError extends Error {}
