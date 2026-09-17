import { describe, expect, it } from "vitest";
import { temAtribuicao } from "../../src/attribution";

describe("temAtribuicao — pura", () => {
  it("nenhum campo informado → false", () => {
    expect(temAtribuicao({})).toBe(false);
    expect(temAtribuicao({ source: null, campaign: undefined })).toBe(false);
  });

  it("string vazia/só espaço não conta como informado", () => {
    expect(temAtribuicao({ source: "", campaign: "   " })).toBe(false);
  });

  it("qualquer campo real informado → true", () => {
    expect(temAtribuicao({ source: "google" })).toBe(true);
    expect(temAtribuicao({ gclid: "abc123" })).toBe(true);
    expect(temAtribuicao({ referrer: "https://instagram.com" })).toBe(true);
  });
});
