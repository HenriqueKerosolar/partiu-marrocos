# T1 — Gates/Approval + Audit Log — Relatório de Fechamento

Escopo autorizado: **PM-T1-001, PM-T1-002, PM-T1-003** (`PLANO-MESTRE-EXECUCAO.md`). Nenhum outro bloco (T2-T5, F2-F6) foi tocado.

---

## 1. Resumo executivo

T1 implementado dentro do escopo exato autorizado. Gate e AuditLog agora são tenant-scoped sob o mesmo Tenant Core (RLS fail-closed + FK composta) já validado no resto do repositório — sem regressão de isolamento. A autoaprovação por agente/sistema é **estruturalmente impossível** (não só validada em runtime): `decisorId` é FK real para `User`, e não existe linha de `User` para "yalla" ou "system". Decisão é atômica sob concorrência real (testado). Append-only do Audit Log é garantido por trigger de banco, com uma exceção deliberada e documentada (`withSystem`, pra não quebrar cascade delete — achado real durante a implementação, corrigido). A integração mínima com o Yalla (PM-T1-003) prova, com testes reais, que uma ação de risco nunca executa sem aprovação humana — nos 3 cenários pedidos (aprovado/rejeitado/expirado).

## 2. Arquivos criados/alterados

**Criados:**
- `packages/db/src/gates.ts`, `packages/db/src/audit.ts`
- `packages/db/tests/unit/gates.test.ts`
- `packages/db/tests/integration/gates-isolation.test.ts`
- `apps/web/src/lib/gates/yallaRiskyAction.ts`
- `apps/web/src/app/api/gates/[id]/decidir/route.ts`
- `apps/web/src/app/(app)/gates/page.tsx`, `.../gates/form.tsx`
- `apps/web/tests/integration/gates-route.test.ts`, `.../yalla-gate-flow.test.ts`

**Alterados:**
- `packages/db/prisma/schema.prisma` (enums `GateStatus`/`GateCategoria`/`ActorType`, model `Gate`, `AuditLog` ganhou `actorType`/`actorLabel`, relações em `Tenant`/`User`)
- `packages/db/prisma/rls.sql` (RLS do `gates`, trigger append-only do `audit_logs`)
- `packages/db/src/permissions.ts` (`gates.view`/`gates.request`/`gates.decide`, atribuídas aos papéis padrão)
- `packages/db/src/index.ts` (exports)
- `apps/web/src/app/(app)/layout.tsx` (link "Aprovações")
- `README.md`

## 3. Migrations

5 migrations novas, aplicadas em sequência:
1. `20260910200000_gates_audit_extend` — schema (tabela `gates`, colunas novas em `audit_logs`)
2. `20260910200030_enable_rls_gates` — RLS + CHECK `gates_decisao_exige_decisor`
3. `20260910200100_audit_logs_append_only` — trigger append-only
4. `20260910200130_audit_append_only_allow_system_cascade` — correção do achado real descrito na seção 8

## 4. Schema final

`Gate` (tenant-scoped, `@@unique([tenantId, id])` para FK composta) + `AuditLog` estendido. Campos completos documentados nos comentários do `schema.prisma` e na seção "T1" do `README.md`.

| Campo | Classificação |
|---|---|
| `AuditLog` (tabela inteira) | **REAPROVEITADO** — já existia desde a fundação |
| `AuditLog.actorType`/`actorLabel` | **ADAPTADO** — campos novos numa tabela existente |
| `Gate` (model inteiro) + `GateStatus`/`GateCategoria`/`ActorType` | **NOVO NECESSÁRIO** |
| `Gate.agentId`/`executionId`/`toolId` | **NOVO, opcional** — compatibilidade futura com T3/T5, sem FK real (esses módulos não existem ainda) |

## 5. Permissões

- `gates.view` — Administrador, Vendas, Atendimento
- `gates.request` — uso interno (o agente Yalla usa via `criarGate`, não é atribuída a papel humano)
- `gates.decide` — só Administrador por padrão (ajustável por tenant, já que Role é configurável)

## 6. Testes criados

32 novos, em 4 arquivos:
- `packages/db/tests/unit/gates.test.ts` — 3 (máquina de estados pura)
- `packages/db/tests/integration/gates-isolation.test.ts` — 18 (RLS, append-only, dupla decisão, concorrência, expiração, autoaprovação impossível)
- `apps/web/tests/integration/gates-route.test.ts` — 7 (401/403/400/404/409/200)
- `apps/web/tests/integration/yalla-gate-flow.test.ts` — 4 (bloqueado/aprovado/rejeitado/expirado, ponta a ponta)

## 7. Resultado completo dos testes

| Pacote | Suíte | Resultado |
|---|---|---|
| `db` | unit | 15/15 PASS |
| `db` | integration | 56/56 PASS |
| `web` | unit+integration | 68/68 PASS |
| **Total** | | **139/139 PASS, 0 FAIL** |

Typecheck limpo nos dois pacotes. Build de produção limpo (19 rotas, exit code 0).

## 8. Testes negativos de segurança

- Cross-tenant: listar/ler/decidir Gate de outro tenant → lista vazia / `null` / `404`
- Fail-closed: sem contexto de tenant, zero linhas retornadas
- Autoaprovação por agente: bloqueada em 2 camadas independentes — CHECK de banco (`gates_decisao_exige_decisor`) e FK (`decisor_id` não aceita valor que não seja um `User.id` real)
- Decisor que não é membro do tenant: rejeitado (`DECISOR_NAO_E_MEMBRO_DO_TENANT`)
- Dupla decisão: bloqueada (`JA_DECIDIDO`, 409 na rota)
- Concorrência real: duas decisões simultâneas (`Promise.all`) na mesma linha — só uma vence
- Append-only: `UPDATE`/`DELETE` via SQL bruto num evento já persistido lança exceção

**Achado real corrigido durante a implementação**: o trigger append-only original bloqueava até `DELETE CASCADE` legítimo (apagar um Tenant inteiro apaga seus `audit_logs` em cascata) — descoberto pelo próprio cleanup do teste de isolamento, corrigido com exceção via `rls_bypass()` (mesma flag do `withSystem`).

## 9. Resultado da regressão

Tenant Core, Auth, RBAC, CRM, Kanban, Lead Capture, WhatsApp, Inbox, Yalla, KeroCar — todos os testes pré-existentes continuam passando. 139/139 no total, nenhuma quebra.

## 10. Decisão sobre HumanActionRequest

**Opção C — futuro KeroModule separado.** Não implementado nesta rodada (a autorização pediu só análise). Gate responde "a IA/sistema *pode* fazer esta ação?"; HumanActionRequest responderia "preciso que um *humano* faça/forneça algo" (OAuth, MFA, colar API key, consentimento, pagamento) — ciclo de vida genuinamente diferente (precisa de `verification_method` SYSTEM_VERIFIED/HUMAN_CONFIRMED, que não faz sentido pra um Gate). O Partiu não tem hoje nenhum fluxo concreto que precise disso (sem OAuth de terceiro, sem "colar chave" pelo Yalla) — construir agora seria especulativo.

## 11. Dívidas/limitações

- `Tenant.aiApiKey` continua em texto plano — bloqueador de produção já registrado antes de T1, fora do escopo desta rodada.
- Expiração é um sweep "preguiçoso" (roda quando alguém lista/decide um Gate) — sem Job Engine (T5), não há expiração proativa em background.
- Verificação visual no navegador confirmou a tela `/gates` renderizando corretamente com o Gate de demo; o clique físico em "Aprovar" esbarrou na mesma instabilidade de renderização do ambiente já registrada antes nesta sessão (não é bug do código — o fluxo de aprovação está coberto por 2 suítes de teste automatizado reais, incluindo via HTTP, provando o mesmo caminho que o clique testaria).

## 12. Branch/commits/status

Este repositório **nunca foi inicializado como git** (confirmado nesta rodada — `fatal: not a git repository`), desde o início da sessão. Não há branch, HEAD nem commits a reportar. Todo o trabalho está no working tree local, sem commit.

## 13. Veredito

**T1 CONCLUÍDO.**

## 14. Recomendação do próximo bloco

**T2 — Cost Control**, conforme o plano mestre — depende estruturalmente de T1 (o bloqueio de custo abre um Gate, que agora existe e está testado). Aguardando autorização explícita — **T2 não foi iniciado automaticamente**.
