# F2 — Internacionalização Foundation — Relatório de Fechamento

Etapa 2 de 5 de PM-NIGHT-RUN-01. Base: `docs/PM_NIGHT_RUN_01_MASTER.md` (Etapa 1), `docs/PM_CRM_FIN_ARCH_01.md` (contratos `Market`/`LegalEntity` já existentes).

## 1. Objetivo

Preparar arquitetura para Country/Market/Language/Currency/Timezone/Locale, começando por Brasil (PT-BR/BRL) e Portugal (PT-PT/EUR), **sem** implementar fiscalidade portuguesa.

## 2. Estado inicial

`Market`/`LegalEntity`/`FiscalProfile`/`CountryPack`/`ExchangeRateQuote` existiam só como contratos TypeScript (PM-CRM-FIN-ARCH-01), sem consumidor real. Formatação de moeda/data no CRM tinha `"pt-BR"` hardcoded em 3 arquivos (`leads/page.tsx`, `gates/page.tsx`, `jobs/page.tsx`), mesmo já recebendo `currency` dinâmico em um dos casos — achado real desta etapa.

## 3. Decisão — Market e LegalEntity NÃO promovidos a tabela

Avaliado explicitamente (seções 13/14 da autorização): **nenhum consumidor real** exige `Market`/`LegalEntity` como entidade persistida nesta rodada — nenhuma tela permite hoje escolher/configurar múltiplos mercados por tenant, nenhuma feature de Finance Core/Proposal (etapas futuras) foi construída ainda pra precisar de uma FK real. Promover agora seria antecipar consumo especulativo. **Mantidos como contrato TypeScript.** Reavaliar quando Etapa 4 (Finance Core Foundation 02) ou Etapa 5 (Proposal Foundation) tiverem um caso de uso concreto.

## 4. O que foi construído de verdade

`packages/db/src/i18n/` (novo):
- `locales.ts` — `LocaleDef` (market/language/currency/timezone, tipos distintos — `MarketCode`/`LanguageCode`/`CurrencyCode`/`TimezoneId`), catálogo `LOCALES` com **BR** (pt-BR/BRL/America/Sao_Paulo) e **PT** (pt-PT/EUR/Europe/Lisbon), `resolverLocale(marketCode)` — nunca adivinha por idioma do navegador/IP, só resolve por código explícito, cai no default (BR) sem lançar erro pra mercado desconhecido.
- `format.ts` — `formatarMoeda(valor, currency, locale?)` (moeda sempre parâmetro explícito, nunca hardcoded) e `formatarDataHora(data, locale?, opts?)` (fuso sempre explícito no `Intl.DateTimeFormat`, instante já é UTC internamente via Postgres/Prisma).

**Achado real corrigido no caminho**: `Intl.DateTimeFormat` não aceita `dateStyle`/`timeStyle` combinado com opções de componente (`hour`/`minute`/...) — o teste pegou isso (`TypeError: Invalid option`). Corrigido: quando `opts` é informado, substitui o padrão por completo em vez de fazer merge parcial.

## 5. Timezone

Princípio confirmado, não uma mudança de comportamento: `DateTime` do Prisma/Postgres já é UTC internamente (nenhuma alteração necessária no schema). O que estava faltando era a **exibição** sempre com fuso explícito — corrigido nos 3 arquivos que formatavam data sem `timeZone` (dependiam implicitamente do fuso do processo Node rodando o servidor). Testado explicitamente: o mesmo instante UTC formatado com locale BR vs. PT produz textos de hora diferentes.

## 6. Localização

`pt-PT` e `pt-BR` distintos no catálogo — nunca tradução automática de texto, só o par idioma/moeda/fuso associado a um mercado. Nenhuma sugestão automática de mercado por IP/idioma do navegador foi implementada (e não deveria ser — mesmo princípio da seção 9 de PM-CRM-FIN-ARCH-01, "não escolher por idioma/IP/moeda do cliente" — aqui estendido: escolha de mercado sempre precisa ser explícita, nunca inferida).

## 7. Currency

Nenhuma mudança no `ExchangeRateQuote` (contrato já existente, sem consumidor real ainda). Princípio câmbio ≠ preço reforçado: `formatarMoeda` recebe `currency` como parâmetro **separado** do `locale` — o locale só formata (separador decimal, símbolo), nunca decide qual moeda usar.

## 8. Portugal nesta etapa

Exatamente o que a autorização define: `market: "PT"`, `language: "pt-PT"`, `currency: "EUR"`, `timezone: "Europe/Lisbon"` no catálogo. **Zero** menção a IVA, AT, faturação, séries, SAF-T, regra contábil ou documento fiscal em qualquer arquivo desta etapa — confirmado, não presumido (nenhum desses termos aparece em `packages/db/src/i18n/`).

## 9. Implementação — arquivos alterados

`packages/db/src/i18n/{locales.ts,format.ts,index.ts}` (novo) · `packages/db/src/index.ts` (+1 export) · `apps/web/src/app/(app)/{leads,gates,jobs}/page.tsx` (troca de `toLocaleString("pt-BR")` hardcoded por `formatarMoeda`/`formatarDataHora`).

## 10. Migrations

**Nenhuma** — Market/LegalEntity não promovidos (seção 3), i18n é só código. 26 migrations continuam, nenhuma nova.

## 11. Segurança

Nada tenant-scoped foi criado — sem superfície nova de RLS/IDOR nesta etapa.

## 12. Testes

9 novos (`packages/db/tests/unit/i18n.test.ts`): resolução de locale (conhecido/desconhecido/null), separação real de idioma/moeda/fuso entre BR e PT, formatação de moeda com moeda≠locale, formatação de data com fuso explícito provando horas diferentes pro mesmo instante.

## 13. Regressão

**297/297 passando** (212 em `packages/db`, 85 em `apps/web`) — 9 a mais que o baseline pós-T6 (288).

## 14. Typecheck / Build

Limpos nos dois pacotes. Build: exit 0, 16 rotas (sem rota nova).

## 15. Dependências

Nenhuma nova.

## 16. Limitações

- Nenhuma tela permite hoje escolher mercado por tenant — o catálogo existe e está testado, mas não há UI consumindo `resolverLocale` com um valor dinâmico ainda (todas as chamadas usam o default BR implicitamente). Fica pronto pra quando essa escolha for exposta.
- `<html lang="pt-BR">` em `app/layout.tsx` não foi tocado — é o idioma do documento HTML servido, uma decisão de roteamento/i18n de UI mais ampla (qual domínio/rota serve qual mercado), fora do escopo de "foundation" desta etapa.
- Site público (`site-original/`) não foi tocado — preços ali são conteúdo estático da página, não dado dinâmico do CRM.

## 17. Decisões humanas pendentes

Nenhuma nova.

## 18. Resultado

**GREEN** — implementação completa dentro do escopo, decisão de não promover Market/LegalEntity avaliada e justificada (não uma omissão), testes novos passando, regressão completa passando, typecheck/build limpos, nenhuma migration (logo nenhum risco de consistência), nenhuma vulnerabilidade introduzida, nenhuma decisão do fundador indispensável, relatório completo.

## 19. Próximo bloco autorizado

Etapa 3 — CRM Evolution 01.
