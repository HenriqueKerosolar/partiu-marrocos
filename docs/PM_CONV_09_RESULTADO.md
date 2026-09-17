# PM-CONV-09 — Resultado: Country Packs

**Status: AUDITADO E CORRIGIDO NO QUE É SEGURO / tributação e requisitos legais permanecem REQUIRES_FISCAL_VALIDATION / REQUIRES_LEGAL_VALIDATION, por design — não por lacuna.**

## O que já existia (auditado, não redescoberto às pressas)

Confirmado por leitura direta de `packages/db/src/i18n/` e `packages/db/src/finance/`:
- `LOCALES` (BR/PT — market+language+currency+timezone) e `resolverLocale()`/`formatarMoeda()`/`formatarDataHora()`, todos testados, nunca inferem mercado por IP/idioma do navegador.
- `CountryPack` registry (`packages/db/src/finance/country-pack-registry.ts`) — default-deny real, testado, **zero packs registrados** (nem BR, nem PT).
- `FiscalProfile`/`Market`/`LegalEntity` — contratos TypeScript puros, nunca promovidos a tabela, "vazios de propósito".
- `HelpCountryContext` (`packages/db/src/help/types.ts`) — parâmetro `_countryContext` existe na assinatura de `resolverAjuda`, mas é **literalmente não lido** dentro da função (confirmado por leitura do corpo da função) — um contrato preparado, não um mecanismo funcionando.

## Por que o registry de CountryPack continua vazio — decisão, não lacuna

`CountryPack` só tem 3 métodos possíveis: `calcularImposto` (cálculo de imposto), `documentosObrigatorios` (quais documentos uma jurisdição exige) e `validarLegalEntity` (validação de identificador fiscal). **Os três são, por natureza, terreno fiscal/legal** — não existe uma implementação "só técnica" e segura de nenhum dos três sem risco real de inventar uma regra tributária ou documental errada. Isso explica, com evidência (não só por precedente), por que três rodadas anteriores (PM-CRM-FIN-ARCH-01, Finance Core Foundation 02, Finance Core Real 01) chegaram à mesma conclusão de manter o registry vazio — não é uma lacuna esquecida se repetindo, é a mesma avaliação correta batendo de novo porque a pergunta não mudou: ainda não existe nenhuma regra fiscal validada juridicamente pra registrar. Registrar um `CountryPack` "PT"/"BR" só com `id`/`nome` (sem nenhum dos 3 métodos) não adicionaria nenhuma capacidade real — seria promoção prematura pelo motivo errado ("pra ter algo"), o mesmo erro que a disciplina do projeto evita desde o início.

**Classificação explícita**: `calcularImposto`/`documentosObrigatorios`/`validarLegalEntity` para PT e BR ficam **REQUIRES_FISCAL_VALIDATION** / **REQUIRES_LEGAL_VALIDATION** — bloqueados até uma validação jurídica/fiscal real (não um código que "parece razoável").

## Achados reais corrigidos nesta rodada (técnicos, não fiscais)

Auditoria de uso de `formatarMoeda`/`formatarDataHora` encontrou um gap técnico genuíno, sem nenhum componente fiscal: **`Trip.timezone` já existia no schema e era exibido como texto solto ao lado da data**, mas a própria data (`dataInicio`/`dataFim`) era formatada sempre no fuso padrão (`America/Sao_Paulo`), nunca no fuso real da operação armazenado no próprio registro. Corrigido em 3 pontos (mesmo padrão, `timeZone` explícito passado pro formatador central já existente — nenhuma lógica nova, só a conexão que faltava):
- `apps/web/src/app/(app)/viagens/[id]/page.tsx` — detalhe da viagem.
- `apps/web/src/app/(app)/viagens/page.tsx` — listagem.
- `apps/web/src/app/(app)/operacoes/page.tsx` + `packages/db/src/operations.ts` (`PainelGrupo` ganhou o campo `timezone`, propagado de `Trip.timezone`, mesma fonte de verdade).

Este é exatamente o tipo de correção que "Country Pack" deveria cobrir sem tocar tributação: usar o dado de localização que já existe corretamente, em vez de assumir um fuso fixo. Coberto indiretamente pelos 9 testes já existentes de `i18n.test.ts` (que provam `formatarDataHora` com `timeZone` explícito produz textos diferentes pro mesmo instante) — a mudança em si é conexão de dado já testado, sem lógica nova a testar isoladamente.

## Achado NÃO corrigido nesta rodada (consciente, baixo risco)

5 componentes ainda formatam moeda com `new Intl.NumberFormat("pt-BR", ...)` direto em vez do `formatarMoeda` central (`proposta-card.tsx`, `payment-list.tsx`, `commission-list.tsx`, `booking-card.tsx`, `premiacoes/page.tsx`). **Confirmado que isso não é um bug funcional hoje** — como nenhuma tela do projeto ainda deixa o usuário escolher um mercado/locale diferente de BR (toda chamada a `formatarDataHora`/`formatarMoeda` no app usa `locale=undefined`, caindo no mesmo default BR), os dois caminhos produzem exatamente a mesma saída hoje. É uma duplicação de código a resolver quando (e não antes de) alguma tela realmente expuser escolha de mercado — corrigir agora exigiria importar `packages/db` (que carrega Prisma/lado servidor) dentro de componentes CLIENT, com risco real de quebrar o bundle do navegador por um ganho comportamental nulo neste momento. Registrado como item de baixo risco pra quando houver motivo real.

## Verificação

- `pnpm --filter @partiumarrocos/db exec tsc --noEmit` e `pnpm --filter web run typecheck` — limpos.
- `pnpm --filter @partiumarrocos/db test` (unit) + `test:integration` — 129/129 + 375/375, incluindo `i18n.test.ts` (9/9) e `finance-country-pack-registry.test.ts` (6/6) confirmando que o registry continua corretamente vazio/default-deny.
- `pm-conv-05c-operations.test.ts` (12/12) — confirma que o novo campo `timezone` em `PainelGrupo` não quebrou nenhuma asserção existente.

## Quantitativo

**Arquivos alterados:** `apps/web/src/app/(app)/viagens/[id]/page.tsx`, `apps/web/src/app/(app)/viagens/page.tsx`, `apps/web/src/app/(app)/operacoes/page.tsx`, `packages/db/src/operations.ts`. **Nenhum arquivo criado, nenhuma migration, nenhum model novo** — correção puramente de conexão de dado já existente.

## Limitações (declaradas)

- `calcularImposto`/`documentosObrigatorios`/`validarLegalEntity` para BR/PT: **REQUIRES_FISCAL_VALIDATION / REQUIRES_LEGAL_VALIDATION** — aguardando validação jurídica real, não código.
- `HelpCountryContext`: continua um parâmetro preparado, não lido — implementá-lo exigiria primeiro decidir QUE conteúdo de Help varia por país (nenhum caso concreto identificado ainda) e adicionar uma dimensão de país em `HELP_CONTENT`, hoje só `helpKey`→`HelpLocale`. Não implementado por falta de consumidor real, mesma disciplina do resto do projeto.
- Duplicação de formatação de moeda em 5 componentes client: baixo risco, adiada conscientemente (ver acima).
- `Market`/`LegalEntity` seguem como contrato TS puro — sem consumidor real (nenhuma tela permite hoje escolher mercado por tenant).
