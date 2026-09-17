import { describe, expect, it } from "vitest";
import { transicaoValidaBooking } from "../../src/booking";

describe("transicaoValidaBooking — máquina de estados pura", () => {
  it("caminho feliz completo: aguardando pagamento → pago → confirmada → em operação → concluída", () => {
    expect(transicaoValidaBooking("AGUARDANDO_PAGAMENTO", "PAGO")).toBe(true);
    expect(transicaoValidaBooking("PAGO", "CONFIRMADA")).toBe(true);
    expect(transicaoValidaBooking("CONFIRMADA", "EM_OPERACAO")).toBe(true);
    expect(transicaoValidaBooking("EM_OPERACAO", "CONCLUIDA")).toBe(true);
  });

  it("caminho com pagamento parcial e documentos pendentes", () => {
    expect(transicaoValidaBooking("AGUARDANDO_PAGAMENTO", "PAGAMENTO_PARCIAL")).toBe(true);
    expect(transicaoValidaBooking("PAGAMENTO_PARCIAL", "PAGO")).toBe(true);
    expect(transicaoValidaBooking("PAGO", "AGUARDANDO_DOCUMENTOS")).toBe(true);
    expect(transicaoValidaBooking("AGUARDANDO_DOCUMENTOS", "CONFIRMADA")).toBe(true);
  });

  it("cancelamento é permitido em todo estado não-terminal", () => {
    for (const de of ["AGUARDANDO_PAGAMENTO", "PAGAMENTO_PARCIAL", "PAGO", "AGUARDANDO_DOCUMENTOS", "CONFIRMADA"] as const) {
      expect(transicaoValidaBooking(de, "CANCELADA")).toBe(true);
    }
  });

  it("estados terminais (CONCLUIDA/CANCELADA) não têm nenhuma transição válida", () => {
    for (const para of ["AGUARDANDO_PAGAMENTO", "PAGAMENTO_PARCIAL", "PAGO", "AGUARDANDO_DOCUMENTOS", "CONFIRMADA", "EM_OPERACAO", "CONCLUIDA", "CANCELADA"] as const) {
      expect(transicaoValidaBooking("CONCLUIDA", para)).toBe(false);
      expect(transicaoValidaBooking("CANCELADA", para)).toBe(false);
    }
  });

  it("não permite pular etapas pra trás (ex.: PAGO nunca volta pra AGUARDANDO_PAGAMENTO)", () => {
    expect(transicaoValidaBooking("PAGO", "AGUARDANDO_PAGAMENTO")).toBe(false);
    expect(transicaoValidaBooking("CONFIRMADA", "PAGO")).toBe(false);
    expect(transicaoValidaBooking("EM_OPERACAO", "CONFIRMADA")).toBe(false);
  });

  it("viagem em operação não pode ser cancelada por esta máquina de estados (caso excepcional é decisão operacional fora da fundação)", () => {
    expect(transicaoValidaBooking("EM_OPERACAO", "CANCELADA")).toBe(false);
  });

  it("transição pra si mesma nunca é válida (nenhum estado se autotransiciona)", () => {
    const estados = ["AGUARDANDO_PAGAMENTO", "PAGAMENTO_PARCIAL", "PAGO", "AGUARDANDO_DOCUMENTOS", "CONFIRMADA", "EM_OPERACAO", "CONCLUIDA", "CANCELADA"] as const;
    for (const e of estados) expect(transicaoValidaBooking(e, e)).toBe(false);
  });
});
