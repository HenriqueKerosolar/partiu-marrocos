import { HELP_CONTENT } from "./content";
import { HELP_ROUTES } from "./registry";
import { HELP_LOCALE_PADRAO, type HelpContent, type HelpLocale } from "./types";

export * from "./types";
export { HELP_ROUTES, HELP_KEYS } from "./registry";
export type { HelpRouteEntry } from "./registry";

/**
 * PM-CONV-04, Track B, §9B — fallback previsível: locale exato →
 * idioma-base (ex.: pt-PT sem conteúdo próprio usa pt-BR, nunca o
 * contrário — variantes de português caem no Brasil, que é o mercado
 * home) → EN → PT-BR (padrão absoluto). NUNCA retorna a chave crua — se
 * nada for encontrado em NENHUM nível, retorna `null` e quem chama decide
 * o que mostrar (nunca "dashboard.overview" na tela do usuário).
 *
 * `countryContext` está no contrato da função (§10B: preparar, não
 * implementar Country Packs) mas não tem nenhuma lógica de override ainda
 * — reservado para quando `Jurisdiction`/Country Pack existirem de verdade.
 */
export function resolverAjuda(helpKey: string, locale: HelpLocale, _countryContext?: string): HelpContent | null {
  const porLocale = HELP_CONTENT[helpKey];
  if (!porLocale) return null;

  if (porLocale[locale]) return porLocale[locale]!;

  // pt-PT sem conteúdo próprio cai em pt-BR (nunca o contrário — ver nota acima).
  if (locale === "pt-PT" && porLocale["pt-BR"]) return porLocale["pt-BR"]!;

  if (porLocale.en) return porLocale.en!;
  if (porLocale[HELP_LOCALE_PADRAO]) return porLocale[HELP_LOCALE_PADRAO]!;

  return null;
}

/** Usado por testes/auditoria (§27: "rotas sem help key = 0") — nunca por UI. */
export function rotasSemHelpKeyRegistrado(): string[] {
  return HELP_ROUTES.filter((r) => !HELP_CONTENT[r.helpKey]).map((r) => r.rota);
}

/** Usado por testes/auditoria — quais locales cada helpKey realmente tem conteúdo próprio (sem fallback). */
export function localesComConteudoProprio(helpKey: string): HelpLocale[] {
  const porLocale = HELP_CONTENT[helpKey];
  if (!porLocale) return [];
  return (Object.keys(porLocale) as HelpLocale[]).filter((l) => !!porLocale[l]);
}

export { HELP_CONTENT };
