import type { z } from "zod";
import type { PrismaClient } from "@prisma/client";

/**
 * Job/Execution Engine (T5) — contrato de definição de tipo de job. Motor
 * genérico e reutilizável (T5 §1) — nada aqui é específico do Partiu.
 *
 * Mesmo espírito do ToolDefinition de T3: `type` só executa se estiver
 * registrado (default-deny, T5 §7/§8); `payloadSchema` valida ANTES de criar
 * o Job (nunca fila genérica que executa payload arbitrário); `handler`
 * recebe um contexto CONFIÁVEL (tenantId vem da linha do Job, nunca do
 * payload — mesma separação contexto-confiável-vs-input-não-confiável do
 * Tool Broker).
 */

export interface JobExecutionContext {
  tenantId: string;
  jobId: string;
  attemptNumber: number;
  workerId: string;
  /**
   * T5-FIX — sinal real de cancelamento, abortado pelo motor exatamente
   * quando `timeoutMs` estoura (ver engine.ts::executarJobReivindicado).
   * Handlers que fazem chamada de rede DEVEM propagar isto pro `fetch`
   * (`fetch(url, {signal})`) sempre que tecnicamente possível — isso
   * cancela a conexão de verdade, em vez de só o motor parar de esperar
   * (`Promise.race` sozinho nunca cancelava nada; ver limitação honesta
   * ainda documentada abaixo para handlers que não têm como propagar).
   */
  signal: AbortSignal;
}

export type ClassificacaoFalha = "RETRYABLE" | "PERMANENTE";

/**
 * Handler lança isto para classificar explicitamente uma falha. Sem isso,
 * uma exceção genérica é tratada como RETRYABLE por padrão (mais seguro
 * assumir transiente do que perder um retry legítimo) — mas erro de
 * validação/permissão deve SEMPRE ser lançado como PERMANENTE
 * explicitamente (T5 §12: nunca repetir VALIDATION_ERROR/FORBIDDEN
 * automaticamente).
 */
export class FalhaJob extends Error {
  constructor(
    message: string,
    public readonly classificacao: ClassificacaoFalha,
  ) {
    super(message);
    this.name = "FalhaJob";
  }
}

/**
 * Handler lança isto quando a ação exige aprovação humana antes de
 * prosseguir — o Job Engine integra com o Gate de T1 sem criar um segundo
 * sistema de aprovação (T5 §19). Nenhum job desta rodada usa isto de
 * verdade (nenhuma ação de Camada 3) — existe só pra provar a capacidade
 * arquitetural, testada com um cenário controlado.
 */
export class BloqueioGateNecessario extends Error {
  constructor(
    public readonly categoria: "FINANCEIRO" | "COMERCIAL" | "PUBLICACAO_EXTERNA" | "ORCAMENTO_PUBLICIDADE" | "EXCLUSAO_DADO" | "ACAO_PRIVILEGIADA" | "ACAO_IRREVERSIVEL",
    public readonly acaoProposta: string,
    message: string,
  ) {
    super(message);
    this.name = "BloqueioGateNecessario";
  }
}

export interface JobDefinition<TPayload = unknown, TResult = unknown> {
  type: string;
  descricao: string;
  payloadSchema: z.ZodType<TPayload>;
  /**
   * Timeout do handler (T5 §15). O motor cria um `AbortController` por
   * execução e o aborta de verdade quando este prazo estoura (ver
   * `ctx.signal`) — não é só `Promise.race` parando de esperar. Ainda
   * assim, um handler que NÃO propaga `ctx.signal` pra dentro de uma
   * chamada assíncrona que ele mesmo não controla (ex.: uma query de banco
   * sem suporte a cancelamento) continua sem ser cancelado de fato — essa
   * parte da limitação (T3 §13) permanece honesta e documentada, agora
   * mais estreita: vale para o que o handler não consegue propagar, não
   * mais para chamadas HTTP que já propagam o sinal.
   */
  timeoutMs: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  priorityPadrao: number;
  handler: (prisma: PrismaClient, ctx: JobExecutionContext, payload: TPayload) => Promise<TResult>;
}
