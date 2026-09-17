import { describe, expect, it } from "vitest";
import { transicaoValidaTrip } from "../../src/trip";

describe("transicaoValidaTrip — máquina de estados pura", () => {
  it("caminho feliz completo: planejamento → confirmada → em andamento → concluída", () => {
    expect(transicaoValidaTrip("PLANEJAMENTO", "CONFIRMADA")).toBe(true);
    expect(transicaoValidaTrip("CONFIRMADA", "EM_ANDAMENTO")).toBe(true);
    expect(transicaoValidaTrip("EM_ANDAMENTO", "CONCLUIDA")).toBe(true);
  });

  it("cancelamento permitido de planejamento e confirmada", () => {
    expect(transicaoValidaTrip("PLANEJAMENTO", "CANCELADA")).toBe(true);
    expect(transicaoValidaTrip("CONFIRMADA", "CANCELADA")).toBe(true);
  });

  it("viagem em andamento não cancela sozinha (mesma decisão de Booking)", () => {
    expect(transicaoValidaTrip("EM_ANDAMENTO", "CANCELADA")).toBe(false);
  });

  it("nunca pula direto de planejamento pra em andamento/concluída", () => {
    expect(transicaoValidaTrip("PLANEJAMENTO", "EM_ANDAMENTO")).toBe(false);
    expect(transicaoValidaTrip("PLANEJAMENTO", "CONCLUIDA")).toBe(false);
  });

  it("estados terminais nunca saem do lugar", () => {
    for (const de of ["CONCLUIDA", "CANCELADA"] as const) {
      for (const para of ["PLANEJAMENTO", "CONFIRMADA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"] as const) {
        expect(transicaoValidaTrip(de, para)).toBe(false);
      }
    }
  });

  it("nenhum estado se autotransiciona", () => {
    const estados = ["PLANEJAMENTO", "CONFIRMADA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"] as const;
    for (const e of estados) expect(transicaoValidaTrip(e, e)).toBe(false);
  });
});
