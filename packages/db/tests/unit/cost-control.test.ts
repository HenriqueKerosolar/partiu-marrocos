import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { calcularCusto, dimensoesParaEscopos, periodoChaveAtual, type PrecoResolvido } from "../../src/cost-control";

function preco(over: Partial<PrecoResolvido> = {}): PrecoResolvido {
  return {
    moeda: "USD",
    unidade: "token",
    precoEntrada: new Prisma.Decimal("0.000003"),
    precoSaida: new Prisma.Decimal("0.000015"),
    precoUnico: null,
    versao: "teste",
    ...over,
  };
}

describe("calcularCusto — precisão monetária (Decimal, nunca float)", () => {
  it("custos fracionários pequenos somam sem erro de ponto flutuante", () => {
    // 0.1 + 0.2 em float dá 0.30000000000000004 — com Decimal, exato.
    const p = preco({ precoEntrada: new Prisma.Decimal("0.1"), precoSaida: new Prisma.Decimal("0.2") });
    const { custoTotal } = calcularCusto({ inputTokens: 1, outputTokens: 1 }, p, { estimado: false });
    expect(custoTotal!.toString()).toBe("0.3");
  });

  it("muitas operações pequenas somadas continuam exatas (soma manual de 1000 eventos de 0.000001)", () => {
    const p = preco({ precoEntrada: new Prisma.Decimal("0.000001"), precoSaida: new Prisma.Decimal("0") });
    let soma = new Prisma.Decimal(0);
    for (let i = 0; i < 1000; i++) {
      const { custoTotal } = calcularCusto({ inputTokens: 1, outputTokens: 0 }, p, { estimado: false });
      soma = soma.add(custoTotal!);
    }
    expect(soma.toString()).toBe("0.001");
  });

  it("soma grande (milhões de tokens) não perde precisão", () => {
    const p = preco({ precoEntrada: new Prisma.Decimal("0.000003"), precoSaida: new Prisma.Decimal("0.000015") });
    const { custoTotal } = calcularCusto({ inputTokens: 5_000_000, outputTokens: 2_000_000 }, p, { estimado: false });
    // 5_000_000 * 0.000003 = 15; 2_000_000 * 0.000015 = 30; total 45
    expect(custoTotal!.toString()).toBe("45");
  });

  it("cachedTokens não é cobrado separadamente (informativo, não precificado nesta rodada)", () => {
    const { custoTotal } = calcularCusto({ inputTokens: 10, outputTokens: 0, cachedTokens: 999_999 }, preco(), { estimado: false });
    expect(custoTotal!.toString()).toBe(new Prisma.Decimal("0.00003").toString());
  });
});

describe("calcularCusto — classificação (costKind)", () => {
  it("subscriptionUsage vira SUBSCRIPTION_USAGE com custo 0, mesmo com preço configurado", () => {
    const r = calcularCusto({ inputTokens: 1000, subscriptionUsage: true }, preco(), { estimado: false });
    expect(r.costKind).toBe("SUBSCRIPTION_USAGE");
    expect(r.custoTotal!.toString()).toBe("0");
  });

  it("freeTierUsage vira FREE_TIER_USAGE com custo 0", () => {
    const r = calcularCusto({ inputTokens: 1000, freeTierUsage: true }, preco(), { estimado: false });
    expect(r.costKind).toBe("FREE_TIER_USAGE");
    expect(r.custoTotal!.toString()).toBe("0");
  });

  it("sem NENHUM preço cadastrado (preco=null) → UNKNOWN, custoTotal null — nunca 0 inventado", () => {
    const r = calcularCusto({ inputTokens: 1000, outputTokens: 500 }, null, { estimado: false });
    expect(r.costKind).toBe("UNKNOWN");
    expect(r.custoTotal).toBeNull();
  });

  it("preço PARCIAL (só precoEntrada, sem precoSaida) → UNKNOWN — fecha a lacuna real encontrada no Ai DEV (lá isso virava 0 silenciosamente)", () => {
    const r = calcularCusto({ inputTokens: 1000, outputTokens: 500 }, preco({ precoSaida: null }), { estimado: false });
    expect(r.costKind).toBe("UNKNOWN");
    expect(r.custoTotal).toBeNull();
  });

  it("USO parcial/ausente (provider não devolveu outputTokens no campo usage) → UNKNOWN, mesmo com preço completo cadastrado — mesma lacuna, do lado do uso em vez do preço", () => {
    const semNenhumUso = calcularCusto({}, preco(), { estimado: false });
    expect(semNenhumUso.costKind).toBe("UNKNOWN");
    expect(semNenhumUso.custoTotal).toBeNull();

    const soInputTokens = calcularCusto({ inputTokens: 100 }, preco(), { estimado: false });
    expect(soInputTokens.costKind).toBe("UNKNOWN");
    expect(soInputTokens.custoTotal).toBeNull();
  });

  it("preço configurado mas uso é genuinamente zero (0 tokens) → ZERO_MARGINAL_COST, não UNKNOWN", () => {
    const r = calcularCusto({ inputTokens: 0, outputTokens: 0 }, preco(), { estimado: false });
    expect(r.costKind).toBe("ZERO_MARGINAL_COST");
    expect(r.custoTotal!.toString()).toBe("0");
  });

  it("custo real conhecido e positivo: estimado=true → ESTIMATED, estimado=false → ACTUAL", () => {
    const estimado = calcularCusto({ inputTokens: 100, outputTokens: 50 }, preco(), { estimado: true });
    const real = calcularCusto({ inputTokens: 100, outputTokens: 50 }, preco(), { estimado: false });
    expect(estimado.costKind).toBe("ESTIMATED");
    expect(real.costKind).toBe("ACTUAL");
    expect(estimado.custoTotal!.toString()).toBe(real.custoTotal!.toString());
  });

  it("unidade não-token: preço único ausente → UNKNOWN; presente → calcula por quantidade", () => {
    const semPreco = calcularCusto({ quantidade: 10 }, preco({ unidade: "mensagem", precoEntrada: null, precoSaida: null, precoUnico: null }), { estimado: false });
    expect(semPreco.costKind).toBe("UNKNOWN");

    const comPreco = calcularCusto({ quantidade: 10 }, preco({ unidade: "mensagem", precoEntrada: null, precoSaida: null, precoUnico: new Prisma.Decimal("0.05") }), { estimado: false });
    expect(comPreco.costKind).toBe("ACTUAL");
    expect(comPreco.custoTotal!.toString()).toBe("0.5");
  });
});

describe("dimensoesParaEscopos — resolução pura de dimensões aplicáveis", () => {
  it("sempre inclui TENANT e PROVIDER", () => {
    const escopos = dimensoesParaEscopos({ provider: "anthropic" });
    expect(escopos).toEqual([
      { escopo: "TENANT", escopoValor: "" },
      { escopo: "PROVIDER", escopoValor: "anthropic" },
    ]);
  });

  it("inclui MODEL/CAPABILITY/AGENT só quando informados", () => {
    const escopos = dimensoesParaEscopos({ provider: "anthropic", model: "claude-3-5-haiku", capability: "chat", agent: "yalla" });
    expect(escopos).toEqual([
      { escopo: "TENANT", escopoValor: "" },
      { escopo: "PROVIDER", escopoValor: "anthropic" },
      { escopo: "MODEL", escopoValor: "claude-3-5-haiku" },
      { escopo: "CAPABILITY", escopoValor: "chat" },
      { escopo: "AGENT", escopoValor: "yalla" },
    ]);
  });
});

describe("periodoChaveAtual — chave de período pura", () => {
  it("DIARIO devolve AAAA-MM-DD", () => {
    expect(periodoChaveAtual("DIARIO", new Date("2026-09-10T23:59:59Z"))).toBe("2026-09-10");
  });

  it("MENSAL devolve AAAA-MM", () => {
    expect(periodoChaveAtual("MENSAL", new Date("2026-09-10T23:59:59Z"))).toBe("2026-09");
  });

  it("POR_CHAMADA não acumula — sem chave de período (null)", () => {
    expect(periodoChaveAtual("POR_CHAMADA", new Date())).toBeNull();
  });
});
