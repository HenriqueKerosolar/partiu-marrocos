# Finance Core Foundation 02 — Relatório de Fechamento

**Etapa 4 de 5 — PM-NIGHT-RUN-01 (COMANDO DE EXECUÇÃO CONTINUADA CONTROLADA)**
Executada sob autorização já concedida ("SE CRM EVOLUTION = GREEN"), sem pausa para nova aprovação, conforme o comando vigente.

## Objetivo

Avaliar as 9 entidades do motor financeiro (`FinancialAccount`/`Receivable`/`Payable`/`FinancialTransaction`/`CostCenter`/`RevenueCenter`/`Commission`/`Refund`/`FinancialCategory`) e implementar **somente** as que já tenham uso arquitetural justificado — preparando (sem forçar) associação futura com Lead/Proposal/Booking/Trip/Customer/Market/Campaign/Supplier/Partner/LegalEntity, sem inventar FK para entidade que ainda não existe. Country Pack Portugal continua explicitamente bloqueado (nenhuma regra fiscal concreta).

## Matriz de classificação (obrigatória antes de qualquer promoção a tabela)

| Entidade | Para que serve | Consumidor real hoje? | Depende de | Decisão |
|---|---|---|---|---|
| `FinancialAccount` | Conta financeira (caixa/banco/gateway) de uma `LegalEntity` | Não — nenhuma tela/fluxo movimenta dinheiro ainda | `LegalEntity` (também não é tabela) | Contrato apenas |
| `FinancialCategory` | Taxonomia de receita/despesa | Não — nada categoriza valor financeiro ainda | — | Contrato apenas |
| `CostCenter` | Agrupamento organizacional de custo | Não | — | Contrato apenas |
| `RevenueCenter` | Agrupamento organizacional de receita | Não | — | Contrato apenas |
| `FinancialTransaction` | Movimentação (crédito/débito) numa conta | Não — sem Booking/Payment, não há evento que gere uma transação real | `FinancialAccount`, potencialmente `Proposal`/`Booking` | Contrato apenas |
| `Receivable` | Valor a receber do cliente | Não — Proposal Foundation (próxima etapa) grava preço/margem NO PRÓPRIO Proposal, não aqui; Booking/Payment (que cobrariam de verdade) estão fora do escopo de toda a janela PM-NIGHT-RUN-01 | `Lead`/`Proposal` | Contrato apenas |
| `Payable` | Valor a pagar a fornecedor/parceiro | Não — `Supplier`/`Partner` nem existem como conceito no código ainda | `Supplier`/`Partner` (não existem) | Contrato apenas |
| `Commission` | Comissão de parceiro/agente por venda | Não — depende de uma venda fechada de verdade (Booking), que não existe | `Partner`, `Booking` (não existem) | Contrato apenas |
| `Refund` | Reembolso ao cliente | Não — depende de um pagamento real já recebido, que não existe | `FinancialTransaction` (também não é tabela) | Contrato apenas |

**Resultado da avaliação: nenhuma das 9 entidades tem hoje um consumidor real no produto.** Não existe Proposal/Booking/Payment implementado nesta base de código — e mesmo a Etapa 5 (Proposal Foundation 01, a seguir) foi desenhada para gravar preço/custo/margem/condições **dentro do próprio `Proposal`**, não delegando a um motor financeiro separado. `Supplier`/`Partner`/`Booking`/`Trip`/`Customer`/`Campaign` não existem como conceito em nenhuma parte do código atual.

## Decisão

Mesma disciplina já aplicada a `Market`/`LegalEntity` na Etapa 2 (F2), conforme a própria autorização permite explicitamente ("avaliar… se não: manter contrato e documentar motivo"): **as 9 entidades ficam como contrato TypeScript puro — zero tabela nova, zero migration nesta rodada.** Implementar tabelas reais sem nenhum consumidor construiria "um ERP que ninguém usa ainda" — princípio já estabelecido em PM-CRM-FIN-ARCH-01 e reafirmado aqui.

Isto **não é** a etapa ficando vazia: a avaliação em si é o entregável obrigatório desta etapa (a autorização pede explicitamente para "avaliar... implementando ONLY as já justificadas"), e o resultado legítimo dessa avaliação é nenhuma promoção — exatamente como aconteceu com Market/LegalEntity, e pelo mesmo motivo.

## Implementação

`packages/db/src/finance/types.ts` (estendido) — 9 novas interfaces + 7 union types de status/natureza, todas documentadas com:
- Referências a entidades futuras sempre como `string` opaca (nunca uma relação Prisma) — nem mesmo `Lead`, que já é tabela real hoje, ganhou FK aqui (a outra ponta, ex. `FinancialTransaction`, também não é tabela — FK só faz sentido quando as duas pontas existem).
- Comentário explícito de que, quando promovidas, RLS/Audit/Gate são obrigatórios desde o primeiro dia — nunca "depois se lembra de adicionar".
- `CostCenter` documentado explicitamente como **não relacionado** ao `CostEvent` de T2 (custo operacional de IA/LLM é um domínio diferente de custo financeiro do negócio de turismo — mesmo princípio de "Audit técnico ≠ timeline comercial" já aplicado em CRM Evolution 01, agora estendido a "custo técnico ≠ custo financeiro").

Nenhum outro arquivo foi tocado — nenhuma tabela, nenhuma migration, nenhuma rota, nenhuma UI.

## Country Pack Portugal

Permanece explicitamente bloqueado — nenhuma regra de IVA/AT/SAF-T/documento fiscal/retenção/código de imposto foi criada ou insinuada. `CountryPackRegistry` (de PM-CRM-FIN-ARCH-01) continua sem nenhum pack real registrado (nem PT, nem BR) — confirmado pelos testes já existentes, inalterados nesta etapa.

## Migrations

**Nenhuma.** 28 migrations continuam (mesmo total da Etapa 3).

## Segurança

Nada a proteger nesta rodada — zero tabela nova significa zero superfície de RLS/Gate/Audit nova. O compromisso arquitetural de que RLS/Audit/Gate serão obrigatórios desde o primeiro dia de qualquer promoção futura está documentado diretamente no código (`types.ts`), não só neste relatório.

## Testes

Nenhum teste novo — consistente com o precedente da Etapa 2 (`Market`/`LegalEntity`/`FiscalProfile`/`ExchangeRateQuote` também não ganharam testes unitários, por serem contratos puros sem comportamento de runtime; só `CountryPack`, que tem um registry real, é testado). Escrever testes para interfaces TypeScript sem lógica associada testaria o próprio compilador, não o produto.

## Regressão

**326/326** (inalterado — mesma contagem da Etapa 3, mudança é aditiva e sem runtime). Typecheck limpo (`packages/db` e `apps/web`). Build limpo — 17 rotas (nenhuma rota nova, esperado).

## Limitações

Nenhuma tabela financeira real existe ainda — qualquer necessidade futura de relatório financeiro, fluxo de caixa, ou reconciliação de pagamento depende de Booking/Payment serem construídos primeiro (fora do escopo de toda a janela PM-NIGHT-RUN-01, listados explicitamente entre os itens que exigem nova autorização).

## Decisões do fundador pendentes

Nenhuma nova — a decisão desta etapa (não promover nenhuma entidade) já está dentro do escopo de autonomia concedido pela própria autorização ("avaliar... se não: manter contrato e documentar motivo", mesmo texto usado para justificar a decisão análoga em F2).

## Resultado / Status

**GREEN** — avaliação completa e documentada das 9 entidades (entregável obrigatório desta etapa), decisão consistente com o precedente já estabelecido (F2) e com os princípios já fixados (PM-CRM-FIN-ARCH-01: "não construir ERP sem consumidor"), nenhuma tabela/migration nova (portanto nenhum risco de RLS ausente, nenhuma FK inventada), Country Pack Portugal continua bloqueado, regressão completa passando, typecheck/build limpos, nenhuma decisão do fundador indispensável.

## Próximo bloco autorizado

Etapa 5 — Proposal Foundation 01. **Prosseguindo automaticamente conforme autorização (PM-NIGHT-RUN-01).**
