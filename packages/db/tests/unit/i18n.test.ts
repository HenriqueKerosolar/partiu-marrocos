import { describe, expect, it } from "vitest";
import { LOCALES, DEFAULT_LOCALE, resolverLocale, formatarMoeda, formatarDataHora } from "../../src/i18n";

describe("resolverLocale — nunca adivinha, só resolve por código explícito", () => {
  it("mercado conhecido devolve o locale correto", () => {
    expect(resolverLocale("PT")).toEqual(LOCALES.PT);
    expect(resolverLocale("BR")).toEqual(LOCALES.BR);
  });

  it("mercado desconhecido cai no default (BR) — nunca lança erro", () => {
    expect(resolverLocale("XX")).toEqual(DEFAULT_LOCALE);
    expect(resolverLocale(null)).toEqual(DEFAULT_LOCALE);
    expect(resolverLocale(undefined)).toEqual(DEFAULT_LOCALE);
  });

  it("BR e PT têm idioma/moeda/fuso realmente diferentes (a separação de conceitos é real, não decorativa)", () => {
    expect(LOCALES.BR!.language).not.toBe(LOCALES.PT!.language);
    expect(LOCALES.BR!.currency).not.toBe(LOCALES.PT!.currency);
    expect(LOCALES.BR!.timezone).not.toBe(LOCALES.PT!.timezone);
  });
});

describe("formatarMoeda — currency é sempre explícito, nunca hardcoded", () => {
  it("formata BRL no padrão brasileiro", () => {
    const texto = formatarMoeda(1234.5, "BRL", LOCALES.BR);
    expect(texto).toContain("R$");
    expect(texto).toMatch(/1\.234,50/);
  });

  it("formata EUR no padrão português, mesmo locale de exibição diferente do BR", () => {
    const texto = formatarMoeda(1234.5, "EUR", LOCALES.PT);
    expect(texto).toContain("€");
  });

  it("moeda é o parâmetro explícito — dá pra formatar EUR usando o locale BR (formato de exibição ≠ moeda)", () => {
    const texto = formatarMoeda(10, "EUR", LOCALES.BR);
    expect(texto).toContain("€"); // moeda vem do parâmetro currency, não do locale
  });

  it("sem locale explícito, usa o default (BR)", () => {
    expect(formatarMoeda(10, "BRL")).toBe(formatarMoeda(10, "BRL", DEFAULT_LOCALE));
  });
});

describe("formatarDataHora — mesmo instante, fuso diferente, texto diferente (nunca ambíguo)", () => {
  it("o mesmo instante UTC exibido em fusos diferentes produz horas diferentes", () => {
    // meio-dia UTC: 09:00 em São Paulo (UTC-3), 13:00 em Lisboa (UTC+1, horário de verão europeu em setembro)
    const instanteUTC = new Date("2026-09-15T12:00:00.000Z");
    const emSP = formatarDataHora(instanteUTC, LOCALES.BR, { timeStyle: "short", dateStyle: undefined });
    const emLisboa = formatarDataHora(instanteUTC, LOCALES.PT, { timeStyle: "short", dateStyle: undefined });
    expect(emSP).not.toBe(emLisboa);
  });

  it("sempre usa timeZone explícito — nunca o fuso implícito do processo rodando o teste", () => {
    const instanteUTC = new Date("2026-01-15T00:30:00.000Z"); // 21:30 do dia anterior em São Paulo (UTC-3)
    const texto = formatarDataHora(instanteUTC, LOCALES.BR, { hour: "2-digit", minute: "2-digit", hour12: false });
    expect(texto).toContain("21:30");
  });
});
