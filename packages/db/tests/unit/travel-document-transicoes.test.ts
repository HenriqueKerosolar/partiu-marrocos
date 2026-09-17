import { describe, expect, it } from "vitest";
import { transicaoValidaDocumento } from "../../src/travel-documents";

describe("transicaoValidaDocumento — máquina de estados pura", () => {
  it("caminho feliz curto: pendente → enviado → aprovado", () => {
    expect(transicaoValidaDocumento("PENDENTE", "ENVIADO")).toBe(true);
    expect(transicaoValidaDocumento("ENVIADO", "APROVADO")).toBe(true);
  });

  it("caminho com análise intermediária (opcional)", () => {
    expect(transicaoValidaDocumento("ENVIADO", "EM_ANALISE")).toBe(true);
    expect(transicaoValidaDocumento("EM_ANALISE", "APROVADO")).toBe(true);
    expect(transicaoValidaDocumento("EM_ANALISE", "REJEITADO")).toBe(true);
  });

  it("rejeitado permite reenvio", () => {
    expect(transicaoValidaDocumento("REJEITADO", "ENVIADO")).toBe(true);
  });

  it("aprovado só vai pra expirado (nunca 'desaprova' sem passar por vencimento)", () => {
    expect(transicaoValidaDocumento("APROVADO", "EXPIRADO")).toBe(true);
    expect(transicaoValidaDocumento("APROVADO", "REJEITADO")).toBe(false);
    expect(transicaoValidaDocumento("APROVADO", "PENDENTE")).toBe(false);
  });

  it("expirado permite reenvio", () => {
    expect(transicaoValidaDocumento("EXPIRADO", "ENVIADO")).toBe(true);
  });

  it("pendente nunca pula direto pra aprovado/rejeitado (precisa ser enviado primeiro)", () => {
    expect(transicaoValidaDocumento("PENDENTE", "APROVADO")).toBe(false);
    expect(transicaoValidaDocumento("PENDENTE", "REJEITADO")).toBe(false);
  });

  it("nenhum estado se autotransiciona", () => {
    const estados = ["PENDENTE", "ENVIADO", "EM_ANALISE", "APROVADO", "REJEITADO", "EXPIRADO"] as const;
    for (const e of estados) expect(transicaoValidaDocumento(e, e)).toBe(false);
  });
});
