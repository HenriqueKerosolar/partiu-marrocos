import { describe, expect, it } from "vitest";
import { transicaoValidaPayment } from "../../src/payment";

describe("transicaoValidaPayment — máquina de estados pura", () => {
  it("caminho feliz: pendente → pago", () => {
    expect(transicaoValidaPayment("PENDENTE", "PAGO")).toBe(true);
  });

  it("caminho com processamento intermediário (ex.: aguardando confirmação de gateway futuro)", () => {
    expect(transicaoValidaPayment("PENDENTE", "PROCESSANDO")).toBe(true);
    expect(transicaoValidaPayment("PROCESSANDO", "PAGO")).toBe(true);
  });

  it("falha permite retry (volta pra PENDENTE) ou cancelamento definitivo", () => {
    expect(transicaoValidaPayment("FALHOU", "PENDENTE")).toBe(true);
    expect(transicaoValidaPayment("FALHOU", "CANCELADO")).toBe(true);
  });

  it("pagamento parcial evolui pra pago total, ou é estornado", () => {
    expect(transicaoValidaPayment("PARCIALMENTE_PAGO", "PAGO")).toBe(true);
    expect(transicaoValidaPayment("PARCIALMENTE_PAGO", "PARCIALMENTE_REEMBOLSADO")).toBe(true);
    expect(transicaoValidaPayment("PARCIALMENTE_PAGO", "REEMBOLSADO")).toBe(true);
  });

  it("pago só pode ir pra estorno (nunca 'cancela' dinheiro já recebido sem devolver)", () => {
    expect(transicaoValidaPayment("PAGO", "REEMBOLSADO")).toBe(true);
    expect(transicaoValidaPayment("PAGO", "PARCIALMENTE_REEMBOLSADO")).toBe(true);
    expect(transicaoValidaPayment("PAGO", "CANCELADO")).toBe(false);
    expect(transicaoValidaPayment("PAGO", "PENDENTE")).toBe(false);
  });

  it("estorno parcial pode completar pra estorno total; estados terminais não saem do lugar", () => {
    expect(transicaoValidaPayment("PARCIALMENTE_REEMBOLSADO", "REEMBOLSADO")).toBe(true);
    for (const de of ["CANCELADO", "REEMBOLSADO"] as const) {
      for (const para of ["PENDENTE", "PROCESSANDO", "PAGO", "PARCIALMENTE_PAGO", "FALHOU", "CANCELADO", "REEMBOLSADO", "PARCIALMENTE_REEMBOLSADO"] as const) {
        expect(transicaoValidaPayment(de, para)).toBe(false);
      }
    }
  });

  it("nunca pula direto de PENDENTE pra REEMBOLSADO (não existe dinheiro recebido pra devolver)", () => {
    expect(transicaoValidaPayment("PENDENTE", "REEMBOLSADO")).toBe(false);
    expect(transicaoValidaPayment("PENDENTE", "PARCIALMENTE_REEMBOLSADO")).toBe(false);
  });

  it("nenhum estado se autotransiciona", () => {
    const estados = ["PENDENTE", "PROCESSANDO", "PAGO", "PARCIALMENTE_PAGO", "FALHOU", "CANCELADO", "REEMBOLSADO", "PARCIALMENTE_REEMBOLSADO"] as const;
    for (const e of estados) expect(transicaoValidaPayment(e, e)).toBe(false);
  });
});
