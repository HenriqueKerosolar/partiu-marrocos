# T2 — Cost Control — Relatório de Fechamento

Escopo autorizado: **T2 — Cost Control** (camada genérica de medição → registro → acumulação → limite → alerta → bloqueio → gate para custo técnico/IA). Nenhum outro bloco (T3 Tool Broker, T4 Model Router, T5 Job Engine, F2-F6, billing/cobrança/fiscal/margem/CFO Agent, `git init`/`push`, chamada paga deliberada) foi tocado.

---

## 1. Resumo executivo

T2 implementado dentro do escopo exato autorizado, sobre a fundação já validada (Tenant Core/RLS, RBAC, Gate/Audit de T1, SecretProvider de PM-BLOQ-001). `CostEvent` é um ledger append-only (mesmo padrão de banco do `AuditLog`) que nunca inventa custo — preço ausente/parcial e uso ausente/parcial classificam explicitamente `UNKNOWN`, nunca `0` silencioso (fechando uma lacuna real encontrada por pesquisa dedicada no Ai DEV Orquestrador). Toda coluna monetária é `Decimal`, nunca float. PRE-CHECK e POST-RECORD são funções separadas sobre o mesmo núcleo de avaliação de política; a reserva de `CostUsage` é atômica via `INSERT...ON CONFLICT...DO UPDATE...RETURNING` (aplicada a VALOR monetário, não só contagem — fecha outra lacuna real do Ai DEV, comprovado por teste de concorrência real com Postgres). Integração com o Gate de T1 é direta (categoria `FINANCEIRO`, nenhum sistema de aprovação novo) e o anti-loop é garantido por um mecanismo de consumo único (`CostGateConsumo`), testado nos três cenários pedidos (reuso de gate pendente, consumo único de aprovação, gate novo após consumo/rejeição). Yalla é o primeiro consumidor real, usando o `usage` de verdade devolvido pela API do provider — nunca uma estimativa pós-chamada. 59 testes novos, todos passando; regressão completa (253 testes) sem quebra; typecheck e build limpos.

## 2. Origem/reaproveitamento do Ai DEV

Pesquisa dedicada desta rodada (agente de pesquisa read-only, evidência de código com arquivo/linha) extraiu o Cost Controller/Budget Foundation do Ai DEV Orquestrador. Adaptado (estrutura/algoritmo reaproveitado): separação PRE-CHECK/POST-RECORD, enum `CostKind`, catálogo de preço versionado por especificidade, upsert atômico `ON CONFLICT...RETURNING`, threshold de alerta configurável. Deliberadamente **não portado** — e por quê: SQLite (→ Postgres), `project_id` opcional (→ `tenantId` obrigatório sob RLS), `REAL`/float (→ `Decimal`), gap de preço/uso parcial virando `0` silencioso (→ fechado dos dois lados), reserva atômica só para contagem de chamadas (→ estendida a valor monetário), idempotência deliberadamente ausente no evento (→ adicionada via `idempotencyKey`, pedido explícito da autorização), anti-loop via máquina de estados de "task" (→ substituído por consumo único em tabela própria, já que este projeto não tem o conceito de task/execução do Ai DEV), ~19 categorias de risco (→ 5 dimensões fechadas que a autorização pediu). Detalhamento completo com justificativa de cada desvio: seção "T2 — Cost Control" do `README.md`.

## 3. Arquitetura final

`CostEvent` (ledger append-only) + `CostPolicy` (limite tenant-scoped) + `CostUsage` (acumulador atômico, só para escopos com política ativa) + `ModelPrice` (catálogo global, sem RLS) + `CostGateConsumo` (consumo único de Gate). Núcleo de lógica em `packages/db/src/cost-control.ts`: funções puras (`calcularCusto`, `dimensoesParaEscopos`, `periodoChaveAtual`) + `preCheckCusto`/`registrarCostEvent` (PRE-CHECK/POST-RECORD, compartilham `avaliarPoliticas`) + CRUD administrativo (`salvarPolitica`/`removerPolitica`/`listarPoliticas`/`obterConsumoAtual`). Detalhamento completo no README.

## 4. Schema/migrations

3 migrations novas, aplicadas em sequência:
1. `20260910210000_cost_control` — schema aditivo (enums `CostKind`/`CostPolicyEscopo`/`CostPolicyPeriodo`, tabelas `cost_events`/`cost_policies`/`cost_usages`/`model_prices`/`cost_gate_consumos`).
2. `20260910210100_enable_rls_cost_control` — RLS nas 4 tabelas tenant-scoped (`model_prices` fica de fora, catálogo global) + trigger append-only em `cost_events` (mesma exceção `rls_bypass()` de T1, aplicada já corrigida desde o início — não um achado novo repetido).

| Model | Classificação |
|---|---|
| `CostEvent`/`CostPolicy`/`CostUsage`/`CostGateConsumo` | **NOVO NECESSÁRIO**, tenant-scoped, RLS |
| `ModelPrice` | **NOVO NECESSÁRIO**, global, sem RLS (mesmo tratamento de `permissions`) |
| `Gate.costGateConsumo` | **ADAPTADO** — relação reversa nova numa tabela existente (T1), nenhum campo do `Gate` em si mudou |

## 5. CostEvent

Ledger append-only (`packages/db/prisma/schema.prisma`). Campos: `tenantId`, `provider`, `model`, `capability`, `agent`, `operation`, `inputTokens`/`outputTokens`/`cachedTokens`, `unidade`/`quantidade` (para cobrança não-token), `moeda`, `custoUnitario`/`custoTotal` (`Decimal?` — `null` é "desconhecido", nunca `0` fingido), `costKind`, `source`, `idempotencyKey` (único por tenant), `metadata` (nunca prompt/resposta completos nem segredo — responsabilidade de quem chama, mesmo contrato do `AuditLog`). Append-only real em banco (trigger), única exceção `rls_bypass()`/`withSystem`.

## 6. CostPolicy

Tenant-scoped, `(escopo, escopoValor, período)` único (upsert nunca duplica). 5 escopos (`TENANT/PROVIDER/MODEL/CAPABILITY/AGENT`), 3 períodos (`POR_CHAMADA/DIARIO/MENSAL`), `alertaPercentual` configurável (default 80%). Só Administrador edita por padrão (`cost.manage`).

## 7. Pricing/model catalog

`ModelPrice` — global, versionado por `vigenteDesde` (mudar preço = nova linha, nunca `UPDATE`). Resolução por especificidade (model+capability > provider curinga), nunca escolhe vigência futura (testado). **Nenhum preço de produção foi cadastrado nesta rodada** — a autorização pediu explicitamente para não pesquisar/chamar API externa de preços; todo `CostEvent` real do Yalla fica `costKind: UNKNOWN` até um administrador cadastrar um preço homologado.

## 8. Pre-check/post-record

`preCheckCusto`: `ALLOW | WARN | REQUIRE_GATE | BLOCK`. Reserva otimista atômica por política `DIARIO`/`MENSAL`; desfaz a própria reserva se estourar (nunca deixa `CostUsage` inflado por uma operação que não vai acontecer). Nunca chama o provider se já claramente bloqueado (verificado na integração com Yalla — `fetch` nunca é chamado quando `preCheckCusto` retorna `REQUIRE_GATE`/`BLOCK`). `registrarCostEvent`: grava o custo REAL, reconcilia o delta contra a reserva do pre-check (não conta a estimativa E o real separadamente), nunca perde o custo real por causa de estouro (o evento é sempre gravado; só o audit muda).

## 9. Integração com Gate

Reaproveita o Gate de T1, categoria `FINANCEIRO` (nenhuma categoria nova no enum — decisão deliberada de rodapé mínimo). Nenhum segundo sistema de aprovação.

## 10. Mecanismo anti-loop

Três invariantes testadas: (1) Gate `PENDENTE` correlacionado ao mesmo `(escopo, escopoValor, período, periodoChave)` é reusado, nunca duplicado; (2) Gate `APROVADO` autoriza exatamente UMA operação via consumo atômico (`CostGateConsumo`, `INSERT...ON CONFLICT DO NOTHING`); (3) autorização já consumida (ou Gate rejeitado/expirado) → próxima tentativa acima do limite abre um Gate novo — nunca trava para sempre, nunca reaproveita uma aprovação indefinidamente.

## 11. Idempotência

`CostEvent.idempotencyKey` único por tenant (`@@unique([tenantId, idempotencyKey])`). Reenvio acidental do mesmo evento não duplica o custo contabilizado — testado (mesma chave duas vezes → 1 linha, `duplicado: true` na segunda chamada).

## 12. Concorrência

`CostUsage.acumulado` só muda via upsert atômico de uma única instrução SQL. Testado com Postgres real (não simulado): duas chamadas concorrentes de custo 6 contra limite 10 (só uma passa); 10 chamadas concorrentes de custo 1 contra limite 5 (exatamente 5 passam, acumulado nunca ultrapassa 5).

## 13. Integração Yalla

`apps/web/src/lib/ai/yalla.ts`: PRE-CHECK (estimativa grosseira de tokens de entrada) → provider real → POST-RECORD com o `usage` REAL devolvido pela resposta (Anthropic `usage.input_tokens`/`output_tokens`, OpenAI `usage.prompt_tokens`/`completion_tokens` — campo documentado e estável das duas APIs, extraído em `apps/web/src/lib/ai/provider.ts`, sem nenhuma chamada real feita para "descobrir" isso). Provider sem `usage` na resposta → `CostEvent` com `costKind: UNKNOWN`, nunca custo inventado. PRE-CHECK bloqueado → Yalla nunca chama o provider (testado, `fetch` não invocado).

## 14. Audit

Reaproveita o Audit Log de T1: `COST_RECORDED`, `COST_THRESHOLD_WARNING`, `COST_LIMIT_REACHED`, `COST_GATE_REQUESTED` (via o mesmo `gate_requested` de T1), `COST_GATE_APPROVED_CONSUMED`, `COST_POLICY_CHANGED` — sempre metadados, nunca valor/prompt/resposta/segredo (testado explicitamente).

## 15. RBAC

`cost.view`/`cost.manage` (catálogo em `permissions.ts`) — só Administrador por padrão nos dois. Yalla nunca recebe permissão humana. Testado: ação sem `cost.manage` rejeitada com `ForbiddenError`, nada escrito.

## 16. UI

`/custos` — consumo hoje/mês (USD), lista de políticas com status Normal/Alerta/Bloqueado, formulário criar/remover política. Verificado ao vivo no navegador (não só testes automatizados): logado como admin de um tenant de verificação temporário, criei uma política "Todo o tenant · Diário · Limite USD 5" pela UI real — a tela atualizou mostrando a política criada com o badge de status correto; tenant/usuário de verificação removidos ao final.

## 17. Testes novos

- `packages/db/tests/unit/cost-control.test.ts` — **17 testes** (precisão Decimal, classificação `costKind` incluindo os dois gaps fechados, dimensões/período puros).
- `packages/db/tests/integration/cost-control.test.ts` — **33 testes** (catálogo de preço, nunca custo 0 inventado, idempotência, append-only + exceção de T1 não ampliada, RLS/IDOR, pre-check ALLOW/WARN/REQUIRE_GATE, anti-loop de Gate ×3, concorrência ×2 com Postgres real, post-record/reconciliação, validação, consumo para UI).
- `apps/web/tests/integration/cost-control-yalla.test.ts` — **4 testes** (pre-check bloqueado nunca chama fetch, usage real gravado, usage ausente vira UNKNOWN, metadata nunca vaza segredo/prompt).
- `apps/web/tests/integration/cost-policy-rbac.test.ts` — **5 testes** (RBAC, validação, IDOR).

Total: **59 testes de segurança/correção novos**, todos passando. `fetch` sempre mockado — nenhuma chamada de IA real/paga em nenhum teste.

## 18. Resultado completo dos testes

| Pacote | Suíte | Resultado |
|---|---|---|
| `db` | unit | 38/38 PASS (21 pré-existentes + 17 novos) |
| `db` | integration | 113/113 PASS (80 pré-existentes + 33 novos) |
| `web` | unit+integration | 102/102 PASS (93 pré-existentes + 9 novos) |
| **Total** | | **253/253 PASS, 0 FAIL** |

## 19. Regressão

Tenant Core, Auth, RBAC, CRM, Kanban, Lead Capture, WhatsApp, Inbox, Yalla (incluindo o `ai-provider.test.ts` adaptado à nova assinatura de `gerarResposta`, que agora devolve `{texto, model, usage}` em vez de só a string — necessário para o Cost Control acessar o `usage` real), T1 Gates/Audit, SecretProvider, KeroCar — todos os testes pré-existentes continuam passando. Nenhuma quebra.

## 20. Build/typecheck

Typecheck limpo em `packages/db` e `apps/web` (`tsc --noEmit`, 0 erros). Build de produção limpo (`next build`, 21 rotas incluindo `/custos`, exit code 0).

## 21. Limitações

- Nenhum preço de produção cadastrado (decisão deliberada da autorização) — até um administrador cadastrar preços reais homologados, todo `CostEvent` do Yalla fica `costKind: UNKNOWN`.
- Sem conversor de moeda (F2 futuro) — política e evento em moedas diferentes não se comparam.
- O teto de custo em DINHEIRO (diferente do de contagem de chamadas, que o Ai DEV já protegia) agora tem reserva atômica real (fechando a lacuna encontrada na pesquisa), mas a reconciliação de POST-RECORD nunca desfaz um gasto real já ocorrido — um custo real que só se revela maior que o estimado depois que outra operação concorrente já usou o limite restante ainda é gravado por completo (nunca perde custo real), só o audit sinaliza o estouro depois do fato. Comportamento intencional (item 10 da autorização: "nunca perder o custo real apenas porque ultrapassou o limite"), documentado como trade-off consciente, não como bug.
- Mesmo achado de T1/PM-BLOQ-001 permanece registrado sem mudança: expiração de Gate continua um sweep preguiçoso (sem Job Engine/T5).

## 22. Status Git

Este repositório **continua sem inicialização git** (`fatal: not a git repository`, reconfirmado nesta rodada). Não há branch, HEAD nem commits a reportar. `git init` não foi executado.

## 23. Veredito

**T2 CONCLUÍDO.**

Checklist do Gate Final (todos verdadeiros): `CostEvent` tenant-scoped existe; ledger é imutável (append-only, testado); `CostPolicy` tenant-scoped existe; precisão monetária é segura (`Decimal`, testado); limites funcionam; pre-check funciona; post-record funciona; desconhecido não vira custo zero (testado dos dois lados — preço e uso); idempotência funciona (testada); concorrência foi testada (Postgres real, 2 cenários); Gate T1 está integrado; aprovação não cria loop infinito (testado, 3 cenários); autorização não pode ser reutilizada (testado); Yalla registra usage/custo real quando disponível (testado); RLS passa em testes negativos; RBAC funciona (testado); Audit registra governança; regressão completa passa (253/253); typecheck passa; build passa.

## 24. Recomendação do próximo bloco

Duas pendências ficam registradas como decisões conscientes deste próprio bloco, não como trabalho comercial novo:
- **Homologar e cadastrar preços reais de produção** para Anthropic/OpenAI em `ModelPrice`, para que o custo do Yalla pare de ficar `UNKNOWN` — não é código, é uma tarefa de configuração/fonte de dados que a autorização pediu para não fazer sozinha nesta rodada.
- Segundo o plano mestre, o próximo bloco natural da trilha transversal é **T3 — Tool Broker**, que junto com T4/T5 completaria a base pra orquestração real de ações — nenhum dos três foi tocado nesta rodada. Aguardando autorização explícita — **T3 não foi iniciado automaticamente**.

---

PARAR. NÃO iniciar T3 automaticamente.
