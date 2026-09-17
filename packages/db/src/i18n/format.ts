import { DEFAULT_LOCALE, type LocaleDef } from "./locales";

/**
 * Formatação de exibição — nunca decide dado de negócio. `currency` é
 * SEMPRE um parâmetro explícito (nunca hardcoded "BRL" em algum lugar do
 * código) — o `locale` só determina o FORMATO (separador decimal, posição
 * do símbolo), nunca qual moeda usar. Isso é o "câmbio ≠ preço" da seção
 * 17 de PM-CRM-FIN-ARCH-01 aplicado ao lado de apresentação: formatar não
 * é decidir.
 */
export function formatarMoeda(valor: number, currency: string, locale: LocaleDef = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale.language, { style: "currency", currency }).format(valor);
}

/**
 * Data/hora — o INSTANTE já é sempre UTC internamente (Postgres/Prisma
 * `DateTime` já garante isso, nenhuma mudança necessária aqui — seção 16:
 * "eventos internos em UTC"). Esta função só resolve a EXIBIÇÃO: mesmo
 * instante, fuso diferente, texto diferente — nunca ambíguo (sempre com
 * `timeZone` explícito no `Intl.DateTimeFormat`, nunca o fuso implícito do
 * servidor/navegador).
 */
export function formatarDataHora(data: Date, locale: LocaleDef = DEFAULT_LOCALE, opts?: Intl.DateTimeFormatOptions): string {
  // `dateStyle`/`timeStyle` não podem ser combinados com opções de
  // componente (hour/minute/...) no mesmo Intl.DateTimeFormat — achado
  // real ao testar: misturar os dois lança "Invalid option". Por isso,
  // quando `opts` é informado, ele substitui o padrão por completo (nunca
  // faz merge parcial); `timeZone` continua sempre explícito de qualquer
  // forma, em ambos os casos.
  const formatOpts: Intl.DateTimeFormatOptions = opts ?? { dateStyle: "short", timeStyle: "short" };
  return new Intl.DateTimeFormat(locale.language, { timeZone: locale.timezone, ...formatOpts }).format(data);
}
