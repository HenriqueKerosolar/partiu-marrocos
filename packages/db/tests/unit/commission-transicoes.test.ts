import { describe, expect, it } from "vitest";
import { transicaoValidaCommission } from "../../src/commission";

describe("transicaoValidaCommission — máquina de estados pura", () => {
  it("caminho feliz: prevista → confirmada → paga", () => {
    expect(transicaoValidaCommission("PREVISTA", "CONFIRMADA")).toBe(true);
    expect(transicaoValidaCommission("CONFIRMADA", "PAGA")).toBe(true);
  });

  it("cancelamento é permitido a partir de PREVISTA ou CONFIRMADA", () => {
    expect(transicaoValidaCommission("PREVISTA", "CANCELADA")).toBe(true);
    expect(transicaoValidaCommission("CONFIRMADA", "CANCELADA")).toBe(true);
  });

  it("nunca pula direto de PREVISTA pra PAGA (precisa confirmar antes)", () => {
    expect(transicaoValidaCommission("PREVISTA", "PAGA")).toBe(false);
  });

  it("estados terminais (PAGA/CANCELADA) não têm nenhuma transição válida", () => {
    for (const de of ["PAGA", "CANCELADA"] as const) {
      for (const para of ["PREVISTA", "CONFIRMADA", "PAGA", "CANCELADA"] as const) {
        expect(transicaoValidaCommission(de, para)).toBe(false);
      }
    }
  });

  it("nenhum estado se autotransiciona", () => {
    const estados = ["PREVISTA", "CONFIRMADA", "PAGA", "CANCELADA"] as const;
    for (const e of estados) expect(transicaoValidaCommission(e, e)).toBe(false);
  });
});
