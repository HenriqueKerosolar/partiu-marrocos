// PM-CONV-04, Track B — Help System. Tipos compartilhados entre o registro
// de conteúdo (content.ts) e o resolvedor (index.ts).

export const HELP_LOCALES = ["pt-BR", "pt-PT", "en", "es", "fr"] as const;
export type HelpLocale = (typeof HELP_LOCALES)[number];

export const HELP_LOCALE_PADRAO: HelpLocale = "pt-BR";

export interface HelpFaqItem {
  pergunta: string;
  resposta: string;
}

export interface HelpContent {
  titulo: string;
  objetivo: string;
  quemUsa: string;
  campos?: string;
  estados?: string;
  acoes?: string;
  avisos?: string;
  faq?: HelpFaqItem[];
}

// §10B do comando — preparado para o futuro, sem Country Packs completos.
// "" (vazio) = sem override, vale para qualquer país daquele idioma.
export type HelpCountryContext = string;
