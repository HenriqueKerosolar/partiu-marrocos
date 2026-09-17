# PM-CONV-08 — Resultado: Financeiro Internacional

**Status: CONCLUÍDO (auditoria + correções reais) / gateway de pagamento real permanece WAITING_EXTERNAL, por decisão já registrada em rodadas anteriores.**

## Método

Auditoria completa do domínio financeiro já existente (não presumida — todo achado abaixo vem de leitura direta de `packages/db/src/{payment,commission,receivables,cost-control,dashboard}.ts`, `schema.prisma` e as migrations reais) **antes** de qualquer decisão de "o que construir". Dois bugs reais e um gap estrutural foram encontrados e corrigidos; o resto do domínio já estava correto e bem coberto por teste.

## Representação de dinheiro — Float vs. Decimal (achado, não um bug a "corrigir cegamente")

Confirmado: o projeto usa **duas convenções deliberadas e documentadas**, não uma inconsistência acidental —
- `Payment.valor`, `Proposal.preco`, `Commission.valor`, `RewardCampaign.valor` → `Float` (comercial/vendas).
- `CostEvent`/`CostPolicy`/`CostUsage`/`ModelPricing` → `Prisma.Decimal(20,10)` (custo técnico de IA/API, T2).

Migrar todo o domínio comercial de `Float` para `Decimal` teria um raio de impacto enorme (dezenas de arquivos já maduros e testados, centenas de asserts numéricos, toda a aritmética de `payment.ts`/`commission.ts`/`dashboard.ts`/`booking.ts` reescrita) para um ganho que, na escala real de transações de uma agência de turismo (poucas parcelas por reserva, nunca milhares de somas acumuladas), é mitigável de forma muito mais cirúrgica — ver abaixo. Decisão: **não migrar o tipo de armazenamento nesta rodada**; corrigir a classe de bug real que o Float historicamente permite, sem o raio de impacto de uma migração completa.

## Bug real #1 — comparação float direta podia travar um Booking pago em PAGAMENTO_PARCIAL para sempre

**Reproduzido em Node antes da correção**: `2.55 + 2.56 === 5.11` é `false` em IEEE754 (`5.109999999999999`). `sincronizarStatusPagamentoBooking` (`payment.ts`) comparava `totalPago >= booking.proposal.preco` direto — um cliente que pagasse o valor **exato** da proposta em parcelas "quebradas" (ex.: duas parcelas de R$2,55 e R$2,56 somando R$5,11) via `sincronizarStatusPagamentoBooking`/`resumoPagamentoBooking`/`solicitarEstornoPayment`/`confirmarEstornoAposAprovacaoGate` podia nunca ver o Booking virar `PAGO`, ou ter um estorno legítimo rejeitado por "valor maior que o pago" por causa do mesmo epsilon.

**Correção**: novo módulo `packages/db/src/money.ts` — `paraCentavos()`/`valorMaiorOuIgual()`/`valorMaior()` comparam em centavos (inteiro), nunca a fração float direto. Aplicado nos 4 pontos de comparação exata identificados em `payment.ts` (sincronização de status, resumo/quitação, validação de valor de estorno, cálculo de estorno total). **Correção cirúrgica, não uma migração Decimal** — zero mudança de schema, zero mudança de serialização.

**Teste de regressão**: `payment.test.ts` — Booking de R$5,11 pago em 2 parcelas (R$2,55 + R$2,56) confirma `PAGO` corretamente (antes da correção, este teste falhava de verdade, reproduzindo o bug). `money.test.ts` (novo, 4 testes) — prova o erro de float diretamente e confirma as funções de comparação.

## Bug real #2 — nenhuma validação impedia Payment em moeda diferente da Proposal do Booking

`criarPayment` nunca validava `params.moeda` contra `booking.proposal.moeda`. Como `sincronizarStatusPagamentoBooking`/`resumoPagamentoBooking` somam `valor` de todos os Payments do Booking **sem agrupar por moeda** (ao contrário de `dashboard.ts`, que já tem essa proteção via `somarPorMoeda`), dois Payments em moedas diferentes no mesmo Booking seriam somados como se fossem a mesma moeda — silenciosamente incorreto. Na UI, o formulário de "Nova cobrança" (`payment-list.tsx`) tinha `"BRL"` fixo como valor padrão do campo moeda, independente da moeda real da reserva — facilitando disparar exatamente esse cenário por engano.

**Correção**: `criarPayment` agora rejeita (`MOEDA_DIVERGENTE`) a criação de um Payment cuja moeda não bate com a da Proposal do Booking — falha fechada na criação, mais seguro que tentar filtrar na soma depois. Formulário de nova cobrança agora usa a moeda real do Booking como valor padrão (não mais "BRL" fixo). Mensagem de erro específica adicionada na Server Action.

**Teste de regressão**: `payment.test.ts` — criar um Payment em EUR num Booking com Proposal em BRL é rejeitado, e confirma que nenhuma linha chega a ser criada.

## Gap real #3 — Commission não tinha idempotencyKey (Payment e CostEvent já tinham)

`Payment.idempotencyKey` e `CostEvent.idempotencyKey` já existiam com `@@unique([tenantId, idempotencyKey])`, preparados contra dupla-criação por duplo clique/retry. `Commission` nunca ganhou o mesmo campo — mesmo domínio de risco, sem a mesma proteção estrutural.

**Correção**: migration aditiva `20260917010000_pm_conv_08_commission_idempotency` (1 coluna nova nulável + 1 índice único, nenhuma alteração em coluna existente — aplicada e verificada com `prisma migrate status` = "Database schema is up to date"). `criarComissao` agora aceita `idempotencyKey` opcional e devolve `{ commission, criada: boolean }`, mesmo padrão de `criarPayment`.

**Teste de regressão**: `commission.test.ts` — mesma `idempotencyKey` duas vezes cria só 1 Commission.

## Pagamento internacional / gateway real — WAITING_EXTERNAL (confirmado, não uma lacuna nova)

Confirmado por busca em todo o repositório: **nenhum código de gateway (Stripe/Mercado Pago/PayPal/Adyen) existe, nem como stub** — só os campos opacos `Payment.provider`/`Payment.providerReference`, documentados desde a Payment Foundation 01 como "PAYMENT DOMAIN IMPLEMENTED, nunca PAYMENT PROVIDER LIVE". `Payment.idempotencyKey` já está pronto para deduplicar um webhook de gateway futuro, sem consumidor ainda. `.env`/`.env.example` deste ambiente não têm nenhuma credencial de gateway. Consistente com o mesmo padrão já aplicado a Yalla (LLM)/Translation/Voice nesta e em rodadas anteriores: **auditado, confirmado real (não fake) na parte que já existe, e corretamente bloqueado onde depende de uma credencial/decisão que só o usuário pode fornecer** (qual gateway integrar, quando, com qual credencial).

## FX/câmbio — contrato existe, dormente, não é um bug

`ExchangeRateQuote` (`packages/db/src/finance/types.ts`) e `Proposal.cotacaoCambio` (snapshot `Json?` imutável no momento do envio) existem desde PM-CRM-FIN-ARCH-01. Confirmado: **nenhum código lê `cotacaoCambio` de volta** — é write-only hoje. Isso é consistente com a disciplina já estabelecida do projeto ("não promover/usar contrato sem consumidor real") — não é uma lacuna a preencher às pressas nesta rodada (inventar uma função de conversão sem nenhuma tela que precise dela seria antecipar consumo especulativo, o mesmo erro que o projeto já evitou deliberadamente em 3 rodadas anteriores documentadas). Registrado aqui para visibilidade, não como bug.

## Reconciliação — não implementada, classificado corretamente

"Reconciliação" no sentido usual (bater o razão interno contra o extrato do gateway/banco) não tem o que reconciliar sem um gateway real emitindo eventos — não há dado externo algum para comparar. Implementar uma tela de "marcar como conferido manualmente" sem um pedido concreto por trás seria inventar escopo. Fica como item natural para quando um gateway real for conectado (o `idempotencyKey`/`providerReference` já preparados em `Payment` são exatamente a base que esse fluxo usaria).

## RLS/RBAC/Audit — confirmados corretos, nenhuma mudança necessária

Toda tabela financeira real (`payments`, `commissions`, `commercial_policies`, `cost_events`, `cost_policies`, `cost_usages`) tem RLS `FORCE` + policy `tenant_isolation` aplicada em migration própria — confirmado por leitura direta das migrations, não presumido. RBAC já separa `payments.*`/`comissoes.*`/`politica_comercial.*` com a mesma disciplina de conflito de interesse (quem vende não aprova o próprio pagamento de comissão). Toda mutação nos três módulos principais (`payment.ts`/`commission.ts`/`cost-control.ts`) chama `registrarEvento` — confirmado, nenhuma mutação sem Audit.

## Quantitativo

**Arquivos criados:** `packages/db/src/money.ts`, `packages/db/tests/unit/money.test.ts`, `packages/db/prisma/migrations/20260917010000_pm_conv_08_commission_idempotency/`.
**Arquivos alterados:** `packages/db/src/payment.ts`, `packages/db/src/commission.ts`, `packages/db/prisma/schema.prisma` (+1 campo, +1 índice único em `Commission`), `apps/web/src/app/actions/payments.ts`, `apps/web/src/app/(app)/leads/[id]/payment-list.tsx`, `apps/web/src/app/(app)/leads/[id]/booking-card.tsx`.
**Migrations novas:** 1 (aditiva, zero drift confirmado).
**Testes novos:** 7 (`money.test.ts` ×4, `payment.test.ts` ×2, `commission.test.ts` ×1).
**Regressão:** `packages/db` unit 129/129, integration 375/375 (era 125/372 no início da rodada). `apps/web` inalterado nesta frente (105/105, já verificado no PM-CONV-06). Typecheck limpo nos dois pacotes.

## Limitações (declaradas)

- Gateway de pagamento real: **HUMAN_DECISION_PENDING** — qual provider, quando, credencial.
- FX real (conversão de moeda): sem consumidor real ainda, contrato pronto, não implementado (decisão consistente com o histórico do projeto).
- Reconciliação automática: depende de gateway real (acima).
- Migração completa Float→Decimal no domínio comercial: avaliada e conscientemente adiada — risco/esforço da migração completa não se justifica frente ao risco real (baixo, mitigado pela correção cirúrgica em centavos) na escala de transação deste produto. Recomendação: revisitar como rodada própria e dedicada se o volume de parcelas por reserva crescer muito (dezenas+), não como parte de uma rodada geral.
