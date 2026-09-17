import { describe, expect, it } from "vitest";
import { paraCentavos, valorMaiorOuIgual, valorMaior } from "../../src/money";

/**
 * PM-CONV-08 — achado real: comparação float direta entre valores
 * monetários somados por caminhos diferentes é insegura (erro de
 * representação binária de fração decimal). Estas comparações em
 * centavos eliminam a classe inteira de erro sem trocar Float por Decimal
 * no schema (ver `money.ts` para a justificativa completa).
 */
describe("paraCentavos — arredonda o erro de representação de float", () => {
  it("2.55 + 2.56 (que resulta em 5.109999999999999 em IEEE754) vira exatamente 511 centavos", () => {
    const soma = 2.55 + 2.56;
    expect(soma).not.toBe(5.11); // prova que o erro de float é real neste caso
    expect(paraCentavos(soma)).toBe(511);
    expect(paraCentavos(5.11)).toBe(511);
  });
});

describe("valorMaiorOuIgual / valorMaior — seguros contra erro de ponto flutuante", () => {
  it("soma exata (com erro de float) é considerada igual ao valor esperado", () => {
    expect(valorMaiorOuIgual(2.55 + 2.56, 5.11)).toBe(true);
  });

  it("valor genuinamente menor continua sendo detectado como menor", () => {
    expect(valorMaiorOuIgual(5.1, 5.11)).toBe(false);
  });

  it("valor genuinamente maior continua sendo detectado como maior", () => {
    expect(valorMaior(5.12, 5.11)).toBe(true);
    expect(valorMaior(5.11, 5.11)).toBe(false); // igual não é "maior"
  });
});
