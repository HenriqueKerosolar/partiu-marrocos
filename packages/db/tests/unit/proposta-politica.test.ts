import { describe, expect, it } from "vitest";
import { avaliarPoliticaComercial, LIMITES_PADRAO } from "../../src/crm/proposta-politica";

const BASE = {
  preco: 1000,
  precoReferencia: null as number | null,
  custos: null as number | null,
  precoVersaoAnterior: null as number | null,
  condicaoExcepcional: false,
  compromissoExternoSensivel: false,
};

describe("avaliarPoliticaComercial — recomenda Gate, nunca aprova sozinha", () => {
  it("proposta simples, sem nenhum gatilho: não exige Gate", () => {
    const r = avaliarPoliticaComercial(BASE);
    expect(r.exigeGate).toBe(false);
    expect(r.motivos).toHaveLength(0);
  });

  it("desconto abaixo do limite (preço de referência): não exige Gate", () => {
    const r = avaliarPoliticaComercial({ ...BASE, precoReferencia: 1000, preco: 900 }); // 10% < 15%
    expect(r.exigeGate).toBe(false);
  });

  it("desconto no limite ou acima: exige Gate com motivo explicável", () => {
    const r = avaliarPoliticaComercial({ ...BASE, precoReferencia: 1000, preco: 850 }); // 15%
    expect(r.exigeGate).toBe(true);
    expect(r.motivos.find((m) => m.fator === "desconto_relevante")?.motivo).toContain("15");
  });

  it("mudança de preço entre versões abaixo do limite: não exige Gate", () => {
    const r = avaliarPoliticaComercial({ ...BASE, precoVersaoAnterior: 1000, preco: 1100 }); // 10% < 20%
    expect(r.exigeGate).toBe(false);
  });

  it("mudança de preço excepcional (pra cima ou pra baixo) exige Gate", () => {
    const paraCima = avaliarPoliticaComercial({ ...BASE, precoVersaoAnterior: 1000, preco: 1300 });
    const paraBaixo = avaliarPoliticaComercial({ ...BASE, precoVersaoAnterior: 1000, preco: 700 });
    expect(paraCima.exigeGate).toBe(true);
    expect(paraBaixo.exigeGate).toBe(true);
  });

  it("margem saudável: não exige Gate", () => {
    const r = avaliarPoliticaComercial({ ...BASE, preco: 1000, custos: 700 }); // margem 30%
    expect(r.exigeGate).toBe(false);
  });

  it("margem abaixo do limite exige Gate", () => {
    const r = avaliarPoliticaComercial({ ...BASE, preco: 1000, custos: 950 }); // margem 5% < 10%
    expect(r.exigeGate).toBe(true);
    expect(r.motivos.find((m) => m.fator === "margem_abaixo_do_limite")).toBeTruthy();
  });

  it("condição comercial excepcional declarada sempre exige Gate, mesmo com números normais", () => {
    const r = avaliarPoliticaComercial({ ...BASE, condicaoExcepcional: true });
    expect(r.exigeGate).toBe(true);
    expect(r.motivos.map((m) => m.fator)).toEqual(["condicao_comercial_excepcional"]);
  });

  it("compromisso externo sensível declarado sempre exige Gate", () => {
    const r = avaliarPoliticaComercial({ ...BASE, compromissoExternoSensivel: true });
    expect(r.exigeGate).toBe(true);
    expect(r.motivos.map((m) => m.fator)).toEqual(["compromisso_externo_sensivel"]);
  });

  it("múltiplos gatilhos simultâneos: todos os motivos aparecem, nenhum é descartado", () => {
    const r = avaliarPoliticaComercial({ preco: 700, precoReferencia: 1000, custos: 680, precoVersaoAnterior: null, condicaoExcepcional: true, compromissoExternoSensivel: false });
    expect(r.exigeGate).toBe(true);
    const fatores = r.motivos.map((m) => m.fator).sort();
    expect(fatores).toEqual(["condicao_comercial_excepcional", "desconto_relevante", "margem_abaixo_do_limite"].sort());
  });

  it("precoReferencia/custos/precoVersaoAnterior ausentes (null) nunca quebram nem inventam gatilho", () => {
    const r = avaliarPoliticaComercial(BASE);
    expect(() => avaliarPoliticaComercial(BASE)).not.toThrow();
    expect(r.exigeGate).toBe(false);
  });

  it("limites padrão exportados batem com os valores usados na avaliação (documentação viva)", () => {
    expect(LIMITES_PADRAO.limiteDescontoRelevante).toBe(0.15);
    expect(LIMITES_PADRAO.limiteMudancaPrecoExcepcional).toBe(0.2);
    expect(LIMITES_PADRAO.limiteMargemMinima).toBe(0.1);
  });

  it("limites customizados (política de tenant) substituem os padrões por completo", () => {
    const limitesCustom = { limiteDescontoRelevante: 0.05, limiteMudancaPrecoExcepcional: 0.5, limiteMargemMinima: 0.3 };
    // 8% de desconto: exigiria Gate com o limite padrão (15%)? não — só testamos que o limite CUSTOM (5%) já dispara
    const r = avaliarPoliticaComercial({ ...BASE, precoReferencia: 1000, preco: 920 }, limitesCustom); // 8% de desconto
    expect(r.exigeGate).toBe(true);
    expect(r.motivos[0]?.motivo).toContain("5.0%"); // usa o limite customizado no texto, não o padrão

    const semGatilhoNoPadrao = avaliarPoliticaComercial({ ...BASE, precoReferencia: 1000, preco: 920 }); // mesmo desconto de 8%, limite padrão 15% — não dispara
    expect(semGatilhoNoPadrao.exigeGate).toBe(false);
  });
});
