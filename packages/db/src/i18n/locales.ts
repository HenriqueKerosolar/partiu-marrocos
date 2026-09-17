/**
 * F2 — Internacionalização Foundation (PM-NIGHT-RUN-01, Etapa 2). Contratos
 * de i18n, sem nenhuma regra fiscal (isso é Country Pack, ver
 * packages/db/src/finance/). Princípio central (mesmo da seção 9 de
 * PM-CRM-FIN-ARCH-01, estendido aqui pro lado de apresentação): país do
 * cliente, mercado, idioma, moeda e fuso são conceitos DIFERENTES — um
 * `LocaleDef` só AGRUPA esses valores pra um mercado conhecido, nunca
 * INFERE um a partir de outro (nunca "idioma do navegador → moeda",
 * "IP do visitante → mercado", etc.).
 */

export type MarketCode = string; // mesmo código usado em Market (finance/types.ts) — ex.: "BR", "PT"
export type LanguageCode = string; // BCP 47, ex.: "pt-BR", "pt-PT"
export type CurrencyCode = string; // ISO 4217, ex.: "BRL", "EUR"
export type TimezoneId = string; // IANA, ex.: "America/Sao_Paulo"

export interface LocaleDef {
  market: MarketCode;
  language: LanguageCode;
  currency: CurrencyCode;
  timezone: TimezoneId;
}

/**
 * Catálogo inicial — só os dois mercados que esta rodada autoriza (seção 12
 * do comando: "Base inicial: Brasil PT-BR/BRL, Portugal PT-PT/EUR").
 * Adicionar um mercado novo é só uma entrada nova aqui — nenhuma migration,
 * nenhuma mudança estrutural.
 */
export const LOCALES: Readonly<Record<MarketCode, LocaleDef>> = Object.freeze({
  BR: Object.freeze({ market: "BR", language: "pt-BR", currency: "BRL", timezone: "America/Sao_Paulo" }),
  PT: Object.freeze({ market: "PT", language: "pt-PT", currency: "EUR", timezone: "Europe/Lisbon" }),
});

export const DEFAULT_LOCALE: LocaleDef = LOCALES.BR!;

/**
 * Resolve o locale efetivo a partir de um código de mercado explícito.
 * NUNCA adivinha por idioma do navegador, IP ou país do cliente — isso
 * seria exatamente o antipadrão que a autorização proíbe (seção 9 de
 * PM-CRM-FIN-ARCH-01: "não escolher regra por idioma/IP/moeda do
 * cliente"). Sem mercado reconhecido, cai no default (BR) — nunca lança
 * erro pra um valor desconhecido, pra não derrubar uma tela por causa de
 * um código de mercado ainda não cadastrado.
 */
export function resolverLocale(marketCode?: MarketCode | null): LocaleDef {
  if (marketCode && LOCALES[marketCode]) return LOCALES[marketCode];
  return DEFAULT_LOCALE;
}
