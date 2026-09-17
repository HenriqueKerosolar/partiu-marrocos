# Finance Core Real 01 — Relatório de Fechamento

**Etapa 3 de 8 — PM-NIGHT-RUN-02 (COMANDO DE EXECUÇÃO CONTINUADA CONTROLADA)**
Executada sob autorização já concedida ("AUTORIZADA SE PAYMENT = GREEN").

## Objetivo

Agora que Booking e Payment são consumidores reais, reavaliar os 9 contratos financeiros de Finance Core Foundation 02 (PM-NIGHT-RUN-01) e promover a tabela **só** as entidades com uso justificado pelo fluxo real. Corrigir a limitação registrada em Proposal Foundation 01 (limiares de política comercial fixos, não configuráveis por tenant).

## Matriz de reavaliação — 9 entidades

| Entidade | Consumidor real agora? | Decisão |
|---|---|---|
| `FinancialAccount` | Não — nenhum fluxo pede escolher uma conta específica | Contrato (inalterado) |
| `FinancialCategory` | Não — nada categoriza Payment/Booking ainda | Contrato (inalterado) |
| `CostCenter` | Não — nenhuma UI/fluxo agrupa por centro de custo | Contrato (inalterado) |
| `RevenueCenter` | Não — idem | Contrato (inalterado) |
| `FinancialTransaction` | Não — depende de `FinancialAccount`, que também não tem consumidor | Contrato (inalterado) |
| `Payable` | Não — `Supplier`/`Partner` não existem como conceito ainda (mesma lacuna de Finance Core Foundation 02) | Contrato (inalterado) |
| **`Receivable`** | Parcial — mas um `Payment` `PENDENTE`/`PROCESSANDO`/`PARCIALMENTE_PAGO` já É estruturalmente "obrigação financeira não liquidada" | **Consulta computada** (`listarContasAReceber`), NÃO tabela — evita duplicar o mesmo dado em duas fontes |
| **`Commission`** | **Sim** — `Booking.responsavelId` já existe desde Booking Foundation 01 | **Promovida a tabela real** |
| **`Refund`** | Sim, mas já resolvido — `Payment.status` (`REEMBOLSADO`/`PARCIALMENTE_REEMBOLSADO`) já cobre isso inteiramente desde Payment Foundation 01 | **Já satisfeito**, nenhuma tabela nova (removida do arquivo de contratos — duplicaria `Payment`) |

**6 de 9 continuam só como contrato** (mesma disciplina de "não construir ERP sem consumidor" de Finance Core Foundation 02) · **1 promovida a tabela** (`Commission`) · **1 virou consulta computada, não tabela** (`Receivable`) · **1 já estava resolvida** (`Refund`, via `Payment`).

## Commission — implementação

`Booking.responsavelId` é o consumidor real. `beneficiarioId` é sempre um `User` desta casa (parceiro/afiliado externo exigiria uma entidade `Partner` que não existe — mesma lacuna documentada pra `Payable`). `valor`/`percentual`/`baseCalculo` são **sempre informados por um humano** — nenhuma fórmula de comissão (`X% de toda venda`) existe ou é aplicada automaticamente.

Máquina de estados: `PREVISTA → CONFIRMADA → PAGA`, `CANCELADA` a partir de `PREVISTA`/`CONFIRMADA`. Pagamento (mover pra `PAGA`) **sempre passa por Gate `FINANCEIRO`** (§21: "alteração sensível de comissão pode exigir Gate") — mesmo padrão exato de estorno de Payment, com a **mesma idempotência real**: reconfirmar um Gate já consumido nunca paga a comissão duas vezes (testado explicitamente).

## Receivable — por que NÃO é uma tabela

Decisão deliberada, documentada no próprio schema: um `Payment` em `PENDENTE`/`PROCESSANDO`/`PARCIALMENTE_PAGO` já é, estruturalmente, "uma obrigação financeira ainda não liquidada". Criar uma tabela `Receivable` paralela duplicaria exatamente esse dado (mesmo valor/vencimento/booking) com risco real de as duas fontes divergirem. `listarContasAReceber` (`packages/db/src/receivables.ts`) entrega a capacidade pedida pelo comando ("Booking/Payment deve permitir gerar contas a receber") como consulta computada — zero duplicação, mesma garantia de RLS que a query de `Payment` já tem.

## CommercialPolicy — corrige a limitação de Proposal Foundation 01

Nova tabela `CommercialPolicy` (uma linha por tenant, `@@unique([tenantId])`). `obterLimitesComerciais` retorna `LIMITES_PADRAO` (mesmos valores fixos de antes: 15%/20%/10%) quando o tenant não tem linha própria — **nenhum tenant existente muda de comportamento silenciosamente**. `enviarProposta` (Proposal Foundation 01) agora carrega os limiares do tenant antes de avaliar a política comercial. Toda alteração é validada (fração em `(0, 1]`) e auditada (`COMMERCIAL_POLICY_ATUALIZADA`, com antes/depois no detalhe).

**Verificado ponta a ponta no navegador**: configurado o limiar de desconto do tenant demo pra 8% (era 15%); uma proposta com 10% de desconto — que NÃO dispararia Gate no limiar padrão — corretamente exigiu aprovação, com o Gate mostrando "limite: 8.0%" (não o valor hardcoded antigo). Prova real de que o limiar configurado é lido, não só gravado.

## Finance × Cost Control — nunca fundidos (§24)

`CostCenter` (Finance Core, ainda contrato) e `CostEvent`/T2 (custo técnico de IA/API) continuam domínios completamente separados — nenhum código nesta etapa referencia `CostEvent` de dentro de `Commission`/`CommercialPolicy`/`receivables.ts`, e vice-versa.

## Fiscal continua bloqueado (§25)

Nenhuma regra de IVA/AT/SAF-T/NIF/emissão fiscal foi criada ou insinuada. `Commission`/`CommercialPolicy` são inteiramente gerenciais/operacionais — nenhuma linha de código toca tributação.

## Migrations

1 nova, puramente aditiva (2 tabelas novas, nenhuma alteração em tabela existente):
```
20260915060000_finance_core_real_01          -- tabelas commercial_policies + commissions
20260915060100_enable_rls_finance_core_real_01  -- RLS
```
**37 migrations no total** (era 35 ao final da Etapa 2).

## RBAC

5 permissões novas: `politica_comercial.view`/`politica_comercial.manage` (Admin-only por padrão — mudar a política de aprovação do tenant é decisão de risco, mesma lógica de `tenant.manage`), `comissoes.view`/`comissoes.manage`/`comissoes.pagar` (Vendas vê comissões mas não gerencia as próprias — conflito de interesse; `comissoes.pagar` Admin-only, mesma lógica de `payments.refund`).

## Segurança

- RLS testado em `CommercialPolicy` e `Commission` (isolamento multi-tenant real).
- `COMMERCIAL_POLICY_ATUALIZADA`, `COMISSAO_CRIADA`, `COMISSAO_CONFIRMADA`, `COMISSAO_CANCELADA`, `COMISSAO_PAGA` auditados.
- Pagamento de comissão nunca autoaprovado — mesmo padrão estrutural de estorno de Payment (decisor sempre um `User` membro real do tenant).

## Testes novos (27)

- `packages/db/tests/unit/commission-transicoes.test.ts` — 5 (máquina de estados pura).
- `packages/db/tests/unit/proposta-politica.test.ts` — +1 (limites customizados substituem o padrão).
- `packages/db/tests/integration/commercial-policy.test.ts` — 6 (default seguro, grava/valida/audita, update parcial preserva outros campos, valor inválido nunca grava, isolamento multi-tenant).
- `packages/db/tests/integration/commission.test.ts` — 10 (criação, beneficiário precisa ser membro, confirmação/cancelamento, pagamento só a partir de CONFIRMADA, Gate real criado, Gate rejeitado nunca paga, **dupla confirmação nunca paga duas vezes**, consultas, isolamento multi-tenant).
- `packages/db/tests/integration/receivables.test.ts` — 5 (Payment pendente aparece, Payment pago desaparece, parcial continua aparecendo, filtro de vencimento, isolamento multi-tenant).

## Regressão

**426/426 testes passando** (399 ao final da Etapa 2 + 27 novos). Typecheck limpo (`packages/db` e `apps/web`). Build limpo — 18 rotas (`/politica-comercial` nova; `/leads/[id]` cresceu de 5.33kB pra 6.07kB — painel de comissões).

## Verificação ponta a ponta (navegador real)

1. `/politica-comercial`: limiares padrão exibidos corretamente (15%/20%/10%) → alterado desconto pra 8% → persistido, exibido de volta.
2. Proposta com 5% de desconto → enviada direto (esperado, abaixo de qualquer limiar).
3. Proposta com 10% de desconto → **AGUARDANDO_APROVACAO** (provaria falso positivo se o limiar padrão de 15% ainda estivesse em uso) → Gate real em `/gates` mostrando "limite: 8.0%" → aprovado → enviada.
4. Proposta aceita → Booking criado → painel "Comissões" aparece com beneficiário pré-preenchido (responsável do booking) → comissão de R$450 (5%) criada como Prevista → Confirmada → "Solicitar pagamento" → Gate FINANCEIRO real em `/gates` com o valor exato → aprovado → **Paga**.

Zero erros de console em todo o fluxo.

## Limitações

`Receivable` não é uma entidade "clicável" própria na UI — é uma consulta (`listarContasAReceber`), sem tela dedicada ainda (poderia virar um relatório futuro). `Commission.beneficiarioId` só aceita usuários desta casa — parceiro/afiliado externo aguarda uma entidade `Partner` futura. `CommercialPolicy` tem só 3 limiares (os citados explicitamente pelo comando) — "outras políticas comerciais justificadas" (§23) ficam pra quando houver caso de uso concreto.

## Decisões do fundador pendentes

Nenhuma nova.

## Resultado / Status

**GREEN** — 9 entidades reavaliadas com justificativa documentada por entidade, `Commission` promovida com consumidor real, `Receivable` implementado sem duplicar `Payment`, `Refund` confirmado já resolvido, `CommercialPolicy` tenant-configurável corrigindo a limitação anterior (verificado ponta a ponta que o limiar customizado é realmente lido), 27/27 testes novos passando, regressão completa (426/426), typecheck/build limpos, RLS/RBAC corretos, nenhuma regra fiscal inventada, Finance × Cost Control nunca fundidos.

## Próximo bloco

Etapa 4 — Travel Document Foundation. **Prosseguindo automaticamente conforme autorização.**
