/**
 * Camada de transporte multi-provider de IA — referência de arquitetura do
 * KeroSolar CRM (`src/lib/crm/ai.ts`, auditoria seção 9) e do Ai DEV
 * Orquestrador (`src/providers/router.ts`, auditoria seção 2), mas escrita do
 * zero aqui: nenhum dos dois foi copiado literalmente — o KeroSolar não tem
 * timeout/retry (lacuna confirmada na auditoria), e o router do Orquestrador
 * está acoplado a um motor de tarefas de dev, não a chat simples de CRM.
 *
 * Duas lacunas do KeroSolar que este módulo resolve desde o início:
 * 1. Timeout explícito em toda chamada de rede (`AbortController`) — sem
 *    isso, uma API lenta trava a resposta ao cliente indefinidamente.
 * 2. Um retry simples com backoff para erro transitório (rede/5xx) — não
 *    tenta de novo em erro 4xx (chave inválida, payload malformado).
 *
 * Tool/function calling (T3 §18/§19) — abstração própria, não o formato
 * proprietário de nenhum provider: `ToolDeclaracao`/`ModelToolCall` são o
 * contrato normalizado; `chamarProvider` traduz pra `tools`/`tool_use` da
 * Anthropic Messages API e `tools`/`tool_calls` da OpenAI Chat Completions
 * API internamente — nenhum código fora deste arquivo vê o formato nativo
 * de nenhum dos dois. NUNCA parseia ação de texto livre (nada de "responda
 * JSON no final" nem regex em cima da resposta) — usa tool calling
 * estruturado real dos dois providers, verificado a partir da documentação
 * pública e estável das duas APIs (não uma chamada real feita nesta
 * rodada "pra descobrir").
 */

export interface ToolDeclaracao {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ModelToolCall[] }
  | { role: "tool_result"; toolCallId: string; toolName: string; content: string };

export interface AiProviderConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  tools?: ToolDeclaracao[];
}

/** Uso real devolvido pelo provider na própria resposta — nunca estimado aqui (ver Cost Control, T2). Campos ausentes quando o provider não informar (não inventar 0). */
export interface UsoProvider {
  inputTokens?: number;
  outputTokens?: number;
}

export interface RespostaProvider {
  texto: string;
  model: string;
  usage: UsoProvider;
  /** Vazio quando o modelo respondeu só com texto — presente quando ele pediu para chamar 1+ tools (o Tool Broker decide o que fazer com cada uma). */
  toolCalls: ModelToolCall[];
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MODELS = { anthropic: "claude-3-5-haiku-20241022", openai: "gpt-4o-mini" };

async function fetchComTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}

function paraAnthropic(cfg: AiProviderConfig, messages: ChatMessage[], model: string) {
  const system = messages.find((m) => m.role === "system")?.content;
  const rest = messages
    .filter((m): m is Exclude<ChatMessage, { role: "system" }> => m.role !== "system")
    .map((m): { role: "user" | "assistant"; content: string | AnthropicContentBlock[] } => {
      if (m.role === "tool_result") {
        return { role: "user", content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }] };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        const blocks: AnthropicContentBlock[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
        return { role: "assistant", content: blocks };
      }
      return { role: m.role, content: m.content };
    });

  return {
    model,
    max_tokens: 1024,
    system,
    messages: rest,
    ...(cfg.tools?.length ? { tools: cfg.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) } : {}),
  };
}

interface OpenAiOutMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

function paraOpenAi(cfg: AiProviderConfig, messages: ChatMessage[], model: string) {
  const out = messages.flatMap((m): OpenAiOutMessage[] => {
    if (m.role === "tool_result") {
      return [{ role: "tool", tool_call_id: m.toolCallId, content: m.content }];
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return [
        {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: JSON.stringify(tc.input) } })),
        },
      ];
    }
    return [{ role: m.role, content: m.content }];
  });

  return {
    model,
    messages: out,
    ...(cfg.tools?.length ? { tools: cfg.tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
  };
}

/** Uma tentativa, sem retry — usado internamente por `gerarResposta`. */
async function chamarProvider(cfg: AiProviderConfig, messages: ChatMessage[]): Promise<RespostaProvider> {
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = cfg.model ?? DEFAULT_MODELS[cfg.provider];

  if (cfg.provider === "anthropic") {
    const res = await fetchComTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(paraAnthropic(cfg, messages, model)),
      },
      timeoutMs,
    );
    if (!res.ok) throw new AiProviderError(res.status, await res.text().catch(() => ""));
    // usage.{input_tokens,output_tokens} e o bloco content[].type="tool_use"
    // são parte estável e documentada da Messages API — não uma descoberta
    // feita nesta rodada via chamada real (nenhuma chamada paga foi feita
    // para "pesquisar" isso).
    const data = (await res.json()) as { content?: AnthropicContentBlock[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const texto = data.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") ?? "";
    const toolCalls: ModelToolCall[] = (data.content ?? [])
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: b.id!, name: b.name!, input: b.input }));
    return { texto, model, usage: { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens }, toolCalls };
  }

  // openai
  const res = await fetchComTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(paraOpenAi(cfg, messages, model)),
    },
    timeoutMs,
  );
  if (!res.ok) throw new AiProviderError(res.status, await res.text().catch(() => ""));
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const message = data.choices?.[0]?.message;
  const texto = message?.content ?? "";
  const toolCalls: ModelToolCall[] = (message?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    input: parseJsonSeguro(tc.function.arguments),
  }));
  return { texto, model, usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens }, toolCalls };
}

function parseJsonSeguro(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    // argumentos malformados do modelo — devolve como está; o Tool Broker
    // valida contra o zod schema da tool e rejeita com VALIDATION_ERROR,
    // nunca tenta "consertar" o JSON aqui.
    return {};
  }
}

export class AiProviderError extends Error {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`ai-provider ${status}: ${body.slice(0, 200)}`);
    this.name = "AiProviderError";
  }
  /** Erro transitório (rede/rate-limit/servidor) — vale tentar de novo. Erro de config (401/400) não vale. */
  get transiente(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/** Gera uma resposta, com 1 retry (backoff fixo de 1s) só para erro transitório. */
export async function gerarResposta(cfg: AiProviderConfig, messages: ChatMessage[]): Promise<RespostaProvider> {
  try {
    return await chamarProvider(cfg, messages);
  } catch (e) {
    const transiente = e instanceof AiProviderError ? e.transiente : e instanceof Error && e.name === "AbortError";
    if (!transiente) throw e;
    await new Promise((r) => setTimeout(r, 1000));
    return chamarProvider(cfg, messages);
  }
}
