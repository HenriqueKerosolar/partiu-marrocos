import { afterEach, describe, expect, it, vi } from "vitest";
import { gerarResposta, AiProviderError } from "../../src/lib/ai/provider";

function respostaAnthropic(texto: string) {
  return { content: [{ type: "text", text: texto }], usage: { input_tokens: 12, output_tokens: 34 } };
}

describe("gerarResposta (camada de transporte multi-provider)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retorna o texto da resposta em caso de sucesso (anthropic)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => respostaAnthropic("Olá! Como posso ajudar?"), text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await gerarResposta({ provider: "anthropic", apiKey: "sk-test" }, [{ role: "user", content: "oi" }]);
    expect(resposta.texto).toBe("Olá! Como posso ajudar?");
    expect(resposta.usage).toEqual({ inputTokens: 12, outputTokens: 34 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lança AiProviderError em erro 401 (chave inválida) sem tentar de novo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(gerarResposta({ provider: "anthropic", apiKey: "chave-errada" }, [{ role: "user", content: "oi" }])).rejects.toBeInstanceOf(
      AiProviderError,
    );
    // 401 não é transiente — não deve haver retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tenta de novo (1x) em erro 429/5xx (transiente), e retorna sucesso se a 2ª tentativa funcionar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "overloaded" })
      .mockResolvedValueOnce({ ok: true, json: async () => respostaAnthropic("recuperado na 2ª tentativa"), text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await gerarResposta({ provider: "anthropic", apiKey: "sk-test" }, [{ role: "user", content: "oi" }]);
    expect(resposta.texto).toBe("recuperado na 2ª tentativa");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 3000);

  it("propaga o erro se a 2ª tentativa (retry) também falhar", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "overloaded" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(gerarResposta({ provider: "anthropic", apiKey: "sk-test" }, [{ role: "user", content: "oi" }])).rejects.toBeInstanceOf(
      AiProviderError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 3000);

  it("respeita o timeout — aborta a chamada e não trava indefinidamente (lacuna real achada na auditoria KeroSolar)", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      gerarResposta({ provider: "anthropic", apiKey: "sk-test", timeoutMs: 20 }, [{ role: "user", content: "oi" }]),
    ).rejects.toThrow();
  }, 3000);

  it("openai: monta o payload certo e extrai o texto de choices[0].message.content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "resposta via openai" } }], usage: { prompt_tokens: 7, completion_tokens: 21 } }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const resposta = await gerarResposta({ provider: "openai", apiKey: "sk-test" }, [{ role: "user", content: "oi" }]);
    expect(resposta.texto).toBe("resposta via openai");
    expect(resposta.usage).toEqual({ inputTokens: 7, outputTokens: 21 });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("api.openai.com");
  });

  describe("tool/function calling (T3 §18/§19) — abstração própria, não o formato nativo de um provider só", () => {
    it("anthropic: declara tools no formato {name,description,input_schema} e extrai tool_use blocks como ModelToolCall[]", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            { type: "text", text: "Vou consultar o lead." },
            { type: "tool_use", id: "toolu_123", name: "lead.consultar", input: {} },
          ],
          usage: { input_tokens: 5, output_tokens: 5 },
        }),
        text: async () => "",
      });
      vi.stubGlobal("fetch", fetchMock);

      const resposta = await gerarResposta(
        { provider: "anthropic", apiKey: "sk-test", tools: [{ name: "lead.consultar", description: "Consulta o lead", inputSchema: { type: "object", properties: {} } }] },
        [{ role: "user", content: "quero saber do meu pacote" }],
      );

      expect(resposta.toolCalls).toEqual([{ id: "toolu_123", name: "lead.consultar", input: {} }]);
      expect(resposta.texto).toBe("Vou consultar o lead.");

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.tools).toEqual([{ name: "lead.consultar", description: "Consulta o lead", input_schema: { type: "object", properties: {} } }]);
    });

    it("anthropic: uma mensagem tool_result vira um bloco {type:'tool_result', tool_use_id, content} numa mensagem user", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => respostaAnthropic("ok, encontrei"), text: async () => "" });
      vi.stubGlobal("fetch", fetchMock);

      await gerarResposta({ provider: "anthropic", apiKey: "sk-test" }, [
        { role: "user", content: "oi" },
        { role: "assistant", content: "", toolCalls: [{ id: "toolu_1", name: "lead.consultar", input: {} }] },
        { role: "tool_result", toolCallId: "toolu_1", toolName: "lead.consultar", content: JSON.stringify({ encontrado: true }) },
      ]);

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      const ultimaMensagem = body.messages[body.messages.length - 1];
      expect(ultimaMensagem).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: JSON.stringify({ encontrado: true }) }] });
    });

    it("openai: declara tools no formato {type:'function', function:{name,description,parameters}} e extrai tool_calls[]", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: null, tool_calls: [{ id: "call_abc", function: { name: "lead.consultar", arguments: "{}" } }] } }],
          usage: { prompt_tokens: 5, completion_tokens: 5 },
        }),
        text: async () => "",
      });
      vi.stubGlobal("fetch", fetchMock);

      const resposta = await gerarResposta(
        { provider: "openai", apiKey: "sk-test", tools: [{ name: "lead.consultar", description: "Consulta o lead", inputSchema: { type: "object", properties: {} } }] },
        [{ role: "user", content: "oi" }],
      );

      expect(resposta.toolCalls).toEqual([{ id: "call_abc", name: "lead.consultar", input: {} }]);

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.tools).toEqual([{ type: "function", function: { name: "lead.consultar", description: "Consulta o lead", parameters: { type: "object", properties: {} } } }]);
    });

    it("openai: tool_result vira {role:'tool', tool_call_id, content}", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }), text: async () => "" });
      vi.stubGlobal("fetch", fetchMock);

      await gerarResposta({ provider: "openai", apiKey: "sk-test" }, [
        { role: "tool_result", toolCallId: "call_abc", toolName: "lead.consultar", content: "{}" },
      ]);

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.messages[0]).toEqual({ role: "tool", tool_call_id: "call_abc", content: "{}" });
    });

    it("argumentos de tool_call malformados (JSON inválido) do provider viram {} em vez de lançar — o Tool Broker é quem valida", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: null, tool_calls: [{ id: "call_x", function: { name: "lead.consultar", arguments: "{not valid json" } }] } }] }),
        text: async () => "",
      });
      vi.stubGlobal("fetch", fetchMock);

      const resposta = await gerarResposta({ provider: "openai", apiKey: "sk-test" }, [{ role: "user", content: "oi" }]);
      expect(resposta.toolCalls).toEqual([{ id: "call_x", name: "lead.consultar", input: {} }]);
    });
  });
});
