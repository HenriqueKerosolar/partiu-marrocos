# PM-CRM-FIN-ARCH-01 — Relatório de Fechamento

Companheiro: `docs/PM_CRM_FIN_ARCH_01.md` (documento de arquitetura completo). Base de continuidade: `RELATORIO-RECONCILIACAO-PM-CODE-HANDOFF-001.md` e `docs/PM_SANEAMENTO_01_FECHAMENTO.md` (não refeitos do zero).

---

## O CRM KeroSolar pôde ser analisado?

Sim — repositório real e acessível em `C:\Projetos\KeroSolar CRM` (git, branch `main`, remote GitHub real). Auditoria dedicada, evidência de arquivo/linha, sem suposição (ver seção 2 do documento de arquitetura).

## O que pode ser reaproveitado?

O **formato/contrato** (não o código): a estrutura Contact→Lead→Pipeline→Stage→Conversation→Message→Task→Note já é quase idêntica entre os dois sistemas — o schema do Partiu já cita explicitamente decisões herdadas do KeroSolar (`Conversation`/`Stage.isWon`/`isLost`). Campos que o KeroSolar tem e o Partiu não (Note.type, Task.type, Lead.lossReason, Lead.highPriority) são candidatos reais de generalização futura, documentados na matriz.

## O que não deve ser reaproveitado?

Todo o domínio solar (`billValue`, `consumoKwh`, tabelas de financiamento, cálculos de ar-condicionado, prompts do bot "Sol") — confirmado isolado em `customFields` Json + módulos próprios, não no schema relacional. Também não reaproveitável: a ausência de multi-tenant do KeroSolar (seria regressão), e o acoplamento direto Prisma+Next.js+cache dentro da lógica de negócio (confirmado não-portável como código, só como padrão).

## Existe necessidade real de CRM Core?

**Como pacote compartilhado extraído: não, ainda não.** Como **especificação de referência documentada**: sim, e é exatamente o que este bloco entrega (o documento de arquitetura + a matriz). Extrair um pacote de verdade exigiria tocar o repositório do KeroSolar (produção, fora de escopo) e resolver divergência de versão (Prisma 5↔7, Next 14↔16) — avaliado e não recomendado nesta rodada (ver "Gate de segurança" abaixo).

## Houve código alterado?

Sim, mínimo: `packages/db/src/finance/` (novo), 1 linha em `packages/db/src/index.ts`, 1 arquivo de teste novo. Nenhum arquivo do CRM existente (`leads.ts`, `schema.prisma` na parte de CRM, páginas `/leads`) foi tocado.

## Houve schema alterado?

Não — zero mudança em `schema.prisma`.

## Houve migration?

Não — 24 migrations continuam, nenhuma nova.

## Finance Core ficou corretamente separado de fiscal?

Sim — `FiscalProfile`/`CountryPack` existem só como contrato/interface, zero regra de IVA, AT, faturação ou percentual concreto em qualquer arquivo. `packages/db/src/finance/types.ts` documenta isso explicitamente no comentário de cada tipo.

## Portugal ficou corretamente isolado como Country Pack futuro?

Sim — nenhuma menção a Portugal em código, só em comentário/documentação como exemplo de jurisdição futura. `obterCountryPack("PT")` devolve `undefined`, testado.

## LegalEntity ficou separada de Market?

Sim — são dois tipos TypeScript independentes, sem relação estrutural direta entre eles (nem FK, já que nenhum dos dois é tabela ainda); `LegalEntity.country` (país de registro jurídico) é conceitualmente distinto de `Market.codigo` (mercado comercial atendido), conforme a distinção pedida na seção 9 da autorização.

## Currency ficou separada de fiscalidade?

Sim — `ExchangeRateQuote` não referencia `FiscalProfile`/`CountryPack` em nenhum campo; o comentário do tipo reforça "câmbio ≠ preço" e que alteração de preço público exige Gate, nunca é automática a partir de cotação.

## Alguma regra fiscal foi indevidamente hardcoded?

**Não — verificado, zero ocorrências.** Nenhum `if idioma === "pt-PT"`, `if currency === "EUR"` ou equivalente foi escrito em nenhum arquivo desta rodada.

## RLS permanece íntegro?

Sim — nenhuma tabela nova foi criada, logo nenhuma política nova era necessária; todas as suítes de isolamento multi-tenant existentes continuam passando (parte da regressão completa abaixo).

## Gates/Audit permanecem íntegros?

Sim — nenhum arquivo de `gates.ts`/`audit.ts` foi tocado; suítes correspondentes passando.

## Quantos testes existem?

**274** (192 em `packages/db`, 82 em `apps/web`).

## Quantos passaram?

**274.**

## Typecheck?

Limpo nos dois pacotes (`tsc --noEmit`, 0 erros).

## Build?

Limpo (`next build`, exit 0, 16 rotas — sem alteração de contagem de rotas, já que nenhuma tela nova foi criada).

## Migration status?

24 migrations, banco em dia (`Database schema is up to date!`).

## Git status?

Repositório continua sem inicialização Git (`fatal: not a git repository`) — confirmado, sem mudança. `git init` não executado.

## Quais decisões (\*) precisam do fundador?

1. **(\*) Convergência de código CRM com KeroSolar** — ver "Gate de segurança" abaixo, as 3+1 opções.
2. **(\*) Quando promover `LegalEntity`/`Market` de tipo TS para tabela real** — só quando houver consumidor real.
3. **(\*) Quando generalizar `Note.type`/`Task.type`/`Lead.lossReason`/`Lead.prioridade`** — melhorias de baixo risco identificadas, não priorizadas.
4. **(\*) Extração de pacote `@keromind/crm-core`** — decisão de infraestrutura maior.
5. Decisões já registradas nos relatórios anteriores continuam abertas sem mudança (WABA real, política de voz, horário humano, área do viajante, regras fiscais por país, vendor do SecretProvider, preços em `ModelPrice`, domínio de produção do site).

### Gate de segurança para separação (seção 22 da autorização)

Avaliado: **convergência de código real com KeroSolar exige alteração estrutural significativa** — versões de Prisma/Next divergentes (5↔7, 14↔16), nenhuma infraestrutura de pacote compartilhado hoje, e retrofit de multi-tenant no KeroSolar (sistema em produção, fora de qualquer autorização recebida nesta rodada). Por isso, **NÃO executada**. Apresentando as opções pedidas:

- [ ] **A — Manter os dois CRMs independentes**, evoluindo cada um no seu ritmo, usando este documento como referência de contrato comum. **Risco: baixo. Esforço: zero agora. Recomendação: esta.**
- [ ] **B — Extrair `@keromind/crm-core` já nesta fase**, exigindo alinhar versões, criar infraestrutura de publicação (registry privado ou monorepo único) e retrofit de multi-tenant no KeroSolar. **Risco: alto (toca produção de outro produto). Esforço: alto. Não recomendado agora.**
- [ ] **C — Migração gradual**: toda vez que o KeroSolar precisar de uma feature nova de CRM, construir já no formato "genérico" (tenant-ready) e promover pedaços ao compartilhado aos poucos. **Risco: médio. Esforço: distribuído. Viável, mas depende de haver demanda real do lado do KeroSolar, que está fora deste escopo de decisão.**
- [ ] **D — Outra opção tecnicamente superior**: manter a opção A, mas formalizar esta matriz como "spec de referência" para qualquer produto CRM novo da KeroMind nascer já alinhado desde o dia 1 (sem versionar nada, sem tocar KeroSolar). **Combina com A, é essencialmente o que já foi entregue nesta rodada.**

## A F1 pode ser considerada tecnicamente fechada? (não pedido pela seção 26, mas relevante ao contexto)

Sem mudança em relação ao relatório anterior — continua tecnicamente fechada no que não depende de WABA real.

## Qual é a recomendação do próximo bloco?

Sem mudança de prioridade: **validar WhatsApp contra WABA real** (fecha F1 de fato) e **T6 — Attribution** (pré-requisito pequeno, e agora com terreno preparado — seção 15 do documento de arquitetura confirma que nada bloqueia). T4 (Model Router) e F2-F6 seguem não iniciados.

---

**VEREDITO: PM-CRM-FIN-ARCH-01 CONCLUÍDO.**

Checklist: CRM KeroSolar analisado com evidência real ✓ · matriz de reaproveitamento produzida ✓ · nenhuma remoção/reescrita do CRM existente ✓ · nenhum código KeroSolar copiado cegamente ✓ · Finance Core projetado como contrato, sem fiscal concreto ✓ · LegalEntity/Market/FiscalProfile/CountryPack/Currency separados corretamente ✓ · gate de segurança da seção 22 aplicado (convergência de código não forçada) ✓ · regressão completa passou (274/274) ✓ · typecheck/build limpos ✓ · migrations = 0 novas, 24 aplicadas ✓ · documentação entregue ✓.

---

PARAR. NÃO iniciar T6. NÃO iniciar T4. NÃO iniciar F2. NÃO iniciar Finance Core completo. NÃO implementar Country Pack Portugal. Aguardando autorização explícita do fundador.
