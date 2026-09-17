import type { PrismaClient, ActorType, ToolRisk } from "@prisma/client";
import { withTenant } from "../tenant-db";
import { registrarEvento } from "../audit";
import { obterTool } from "./registry";
import { possuiGrant } from "./grants";
import { ToolNotFoundError, ToolConflictError, type ToolExecutionContext, type ToolResult } from "./types";

/**
 * Tool Broker — o único caminho pelo qual uma tool é executada. Nenhum
 * outro código deste projeto deve chamar `tool.handler` diretamente.
 *
 * Ordem de decisão (cada etapa pode encerrar a chamada):
 * 1. Tool existe no registry? Não → DENY (NOT_FOUND). Nome inventado pelo
 *    modelo nunca chega perto de um handler.
 * 2. `toolCallId` já foi processado por este tenant? (idempotência real,
 *    `UNIQUE(tenantId, toolCallId)`) → replay devolve o resultado
 *    cacheado sem reexecutar; uma tentativa anterior não-concluída vira
 *    CONFLICT (nunca reexecuta silenciosamente).
 * 3. Grant ativo pra (tenant, agent, capability)? Não → DENY (FORBIDDEN).
 *    Default-deny: nenhuma tool roda só porque existe.
 * 4. Input válido contra o schema declarado da tool? Não → VALIDATION_ERROR.
 * 5. Executa com timeout. Sucesso → valida output contra o schema
 *    declarado (defesa em profundidade — o handler nunca vaza mais do que
 *    prometeu). Timeout/erro → TIMEOUT/INTERNAL_ERROR, nunca stack trace.
 *
 * Cada etapa relevante grava um evento no Audit Log de T1
 * (TOOL_REQUESTED/ALLOWED/DENIED/STARTED/COMPLETED/FAILED/TIMEOUT) — nunca
 * o payload bruto de entrada/saída, só metadados seguros.
 */

class ToolTimeoutError extends Error {}

function comTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ToolTimeoutError(`timeout após ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function auditarTool(
  prisma: PrismaClient,
  ctx: ToolExecutionContext,
  info: { id: string; risk?: ToolRisk; capability?: string },
  acao: string,
  resultado: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  await withTenant(prisma, ctx.tenantId, (tx) =>
    registrarEvento(tx, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorLabel: ctx.actorLabel ?? ctx.agent,
      acao,
      entidade: "Tool",
      entidadeId: info.id,
      resultado,
      detalhe: { toolId: info.id, risk: info.risk, capability: info.capability, agent: ctx.agent, ...extra },
    }),
  );
}

export interface ExecutarToolParams {
  toolId: string;
  toolCallId: string;
  input: unknown;
}

export async function executarTool(prisma: PrismaClient, ctx: ToolExecutionContext, chamada: ExecutarToolParams): Promise<ToolResult> {
  const tool = obterTool(chamada.toolId);

  if (!tool) {
    await auditarTool(prisma, ctx, { id: chamada.toolId }, "TOOL_DENIED", "tool_desconhecida");
    return { status: "NOT_FOUND", error: `Ferramenta "${chamada.toolId}" não existe.` };
  }

  // Idempotência: reserva atômica do toolCallId por tenant. Replay de uma
  // chamada já concluída devolve o mesmo resultado sem reexecutar o side
  // effect; qualquer outro estado anterior (ainda em andamento, falhou,
  // negada) vira CONFLICT — nunca reexecuta silenciosamente.
  const reserva = await reservarToolCall(prisma, ctx.tenantId, { toolCallId: chamada.toolCallId, toolId: tool.id, agent: ctx.agent, risk: tool.risk });
  if (!reserva.nova) {
    if (reserva.registro.status === "COMPLETED") {
      return { status: "SUCCESS", data: reserva.registro.resultado ?? undefined };
    }
    return { status: "CONFLICT", error: "Esta chamada já foi processada e não pode ser repetida." };
  }

  await auditarTool(prisma, ctx, tool, "TOOL_REQUESTED", "pendente");

  const grantOk = await possuiGrant(prisma, ctx.tenantId, ctx.agent, tool.capability);
  if (!grantOk) {
    await finalizarToolCall(prisma, ctx.tenantId, chamada.toolCallId, { status: "FAILED", erro: "sem_grant" });
    await auditarTool(prisma, ctx, tool, "TOOL_DENIED", "sem_grant");
    return { status: "FORBIDDEN", error: "Este agente não tem permissão para usar esta ferramenta." };
  }
  await auditarTool(prisma, ctx, tool, "TOOL_ALLOWED", "ok");

  const entradaValidada = tool.inputSchema.safeParse(chamada.input);
  if (!entradaValidada.success) {
    await finalizarToolCall(prisma, ctx.tenantId, chamada.toolCallId, { status: "FAILED", erro: "input_invalido" });
    await auditarTool(prisma, ctx, tool, "TOOL_DENIED", "input_invalido");
    return { status: "VALIDATION_ERROR", error: "Entrada inválida para esta ferramenta." };
  }

  await auditarTool(prisma, ctx, tool, "TOOL_STARTED", "iniciado");
  const inicio = Date.now();

  try {
    const saida = await comTimeout(Promise.resolve(tool.handler(prisma, ctx, entradaValidada.data)), tool.timeoutMs);
    const duracaoMs = Date.now() - inicio;

    const saidaValidada = tool.outputSchema.safeParse(saida);
    if (!saidaValidada.success) {
      // handler produziu algo fora do contrato declarado — falha defensiva,
      // nunca vaza o formato bruto pro modelo.
      await finalizarToolCall(prisma, ctx.tenantId, chamada.toolCallId, { status: "FAILED", erro: "output_fora_do_contrato", duracaoMs });
      await auditarTool(prisma, ctx, tool, "TOOL_FAILED", "output_invalido", { duracaoMs });
      return { status: "INTERNAL_ERROR", error: "Falha ao executar a ferramenta." };
    }

    await finalizarToolCall(prisma, ctx.tenantId, chamada.toolCallId, { status: "COMPLETED", resultado: saidaValidada.data as object, duracaoMs });
    await auditarTool(prisma, ctx, tool, "TOOL_COMPLETED", "ok", { duracaoMs });
    return { status: "SUCCESS", data: saidaValidada.data };
  } catch (e) {
    const duracaoMs = Date.now() - inicio;
    if (e instanceof ToolTimeoutError) {
      await finalizarToolCall(prisma, ctx.tenantId, chamada.toolCallId, { status: "TIMEOUT", duracaoMs });
      await auditarTool(prisma, ctx, tool, "TOOL_TIMEOUT", "timeout", { duracaoMs });
      return { status: "TIMEOUT", error: "A ferramenta demorou demais para responder." };
    }
    if (e instanceof ToolNotFoundError) {
      await finalizarToolCall(prisma, ctx.tenantId, chamada.toolCallId, { status: "FAILED", erro: "nao_encontrado", duracaoMs });
      await auditarTool(prisma, ctx, tool, "TOOL_FAILED", "nao_encontrado", { duracaoMs });
      return { status: "NOT_FOUND", error: e.message };
    }
    if (e instanceof ToolConflictError) {
      await finalizarToolCall(prisma, ctx.tenantId, chamada.toolCallId, { status: "FAILED", erro: "conflito", duracaoMs });
      await auditarTool(prisma, ctx, tool, "TOOL_FAILED", "conflito", { duracaoMs });
      return { status: "CONFLICT", error: e.message };
    }
    await finalizarToolCall(prisma, ctx.tenantId, chamada.toolCallId, { status: "FAILED", erro: "erro_interno", duracaoMs });
    await auditarTool(prisma, ctx, tool, "TOOL_FAILED", "erro_interno", { duracaoMs });
    return { status: "INTERNAL_ERROR", error: "Falha ao executar a ferramenta." }; // nunca a mensagem/stack real do erro
  }
}

type ReservaToolCall = { nova: true } | { nova: false; registro: { status: string; resultado: unknown } };

async function reservarToolCall(
  prisma: PrismaClient,
  tenantId: string,
  params: { toolCallId: string; toolId: string; agent: string; risk: ToolRisk },
): Promise<ReservaToolCall> {
  // INSERT...ON CONFLICT DO NOTHING (não create()+catch): um erro de
  // constraint dentro de uma transação interativa do Prisma deixa a
  // transação Postgres inteira "abortada" (25P02) — qualquer query
  // subsequente na MESMA transação falharia, mesmo dentro do catch. Mesmo
  // padrão atômico já usado em cost-control.ts::ajustarCostUsage.
  return withTenant(prisma, tenantId, async (tx): Promise<ReservaToolCall> => {
    const inserida = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO tool_calls (id, tenant_id, tool_call_id, tool_id, agent, risk, status, created_at, updated_at)
      VALUES (gen_random_uuid()::text, ${tenantId}, ${params.toolCallId}, ${params.toolId}, ${params.agent}, ${params.risk}::"ToolRisk", 'STARTED'::"ToolCallStatus", now(), now())
      ON CONFLICT (tenant_id, tool_call_id) DO NOTHING
      RETURNING id
    `;
    if (inserida.length > 0) return { nova: true };

    const existente = await tx.toolCall.findUniqueOrThrow({ where: { tenantId_toolCallId: { tenantId, toolCallId: params.toolCallId } } });
    return { nova: false, registro: { status: existente.status, resultado: existente.resultado } };
  });
}

async function finalizarToolCall(
  prisma: PrismaClient,
  tenantId: string,
  toolCallId: string,
  dados: { status: "COMPLETED" | "FAILED" | "TIMEOUT"; resultado?: object; erro?: string; duracaoMs?: number },
): Promise<void> {
  await withTenant(prisma, tenantId, (tx) =>
    tx.toolCall.update({
      where: { tenantId_toolCallId: { tenantId, toolCallId } },
      data: { status: dados.status, resultado: dados.resultado as object | undefined, erro: dados.erro ?? null, duracaoMs: dados.duracaoMs ?? null },
    }),
  );
}
