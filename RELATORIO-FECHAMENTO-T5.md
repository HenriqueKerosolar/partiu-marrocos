# T5 — Job/Execution Engine — Relatório de Fechamento

Escopo autorizado: **T5 — Job/Execution Engine** (Job, Execution, Queue, worker, claim, lease, heartbeat, retry, backoff, timeout, priority, dependency quando comprovadamente necessária, blocked reason, resume, dead-letter, idempotência, concorrência, RLS, RBAC administrativo, Audit, integração controlada com WhatsApp/follow-up, testes, migrations, documentação), executado **antes** de T4 — Model Router por decisão explícita do usuário (justificativa: o sistema já tinha ações reais desde T3 e precisava de execução assíncrona confiável antes de aumentar a complexidade de providers). Nenhum T4, nenhuma Camada 3 do Yalla, nenhum F2-F6, nenhuma ação financeira/marketing/publicação social/Ads, `git init`/`push` não executados.

---

## 1. Resumo executivo

T5 implementado dentro do escopo exato autorizado, sobre a fundação já validada (T1 Gates/Audit, PM-BLOQ-001 SecretProvider, T2 Cost Control, T3 Tool Broker). O Partiu Marrocos ganhou um motor genérico e reutilizável de execução assíncrona (`REQUEST → JOB → QUEUE → CLAIM/LEASE → EXECUTION → SUCCESS/RETRY/FAILED/DEAD_LETTER/BLOCKED → AUDIT`) — não específico deste produto, pensado para servir qualquer módulo futuro da KeroMind. Claim é atomicamente seguro sob concorrência real (`FOR UPDATE SKIP LOCKED`, testado com múltiplos workers e um teste de carga de 100 jobs, zero perdidos/zero duplicados). Lease com heartbeat e fencing real garante que um worker que morre é recuperado por outro, e que o worker antigo (stale) nunca consegue confirmar sucesso de uma tentativa que já não é mais dele — testado ponta a ponta simulando a morte de um worker de verdade. Retry usa backoff exponencial e distingue falha retryable de permanente (nunca repete `VALIDATION_ERROR`/`FORBIDDEN`/janela de 24h fechada); esgotadas as tentativas, o Job vai para `DEAD_LETTER` sem nunca continuar eternamente. Gate de T1 é integrado sem criar um segundo sistema de aprovação. O primeiro caso real (reenvio confiável de mensagem WhatsApp) já está em produção no webhook, com limitação honestamente documentada. 44 testes novos, todos passando; regressão completa (337 testes: 221 em `packages/db` + 116 em `apps/web`, vindo de 293 antes desta rodada) sem quebra; typecheck e build limpos.

## 2. Reaproveitamento do Ai DEV

A pesquisa dedicada ao Job/Task/Execution Engine do Ai DEV Orquestrador (agente read-only, mesmo formato das pesquisas de T2/T3) **atingiu o limite de sessão da API antes de terminar** (erro `rate_limit`, HTTP 429) e não retornou um relatório completo desta vez — diferente de T2/T3, onde a pesquisa concluiu integralmente. Decisão tomada: **não bloquear T5 esperando a pesquisa** — o desenho foi construído diretamente a partir dos princípios já comprovados nas duas pesquisas anteriores (Cost Control e Tool Broker) e dos padrões já validados e testados neste próprio repositório (`gates.ts::expirarSeVencido` para sweep preguiçoso sem cron dedicado; `cost-control.ts::ajustarCostUsage`/`tools/broker.ts::reservarToolCall` para `INSERT...ON CONFLICT...RETURNING` atômico; a mesma exceção `rls_bypass()`/`withSystem` para cascade delete). Esta é uma diferença real desta rodada, registrada aqui com honestidade — não uma pesquisa completa reaproveitada, mas uma extensão consistente do que as pesquisas anteriores já haviam estabelecido como padrão comprovado nesta casa. O parágrafo final do resultado parcial recebido antes do rate limit confirmou pelo menos: CLI própria (`orc worker run`) como processo separado, e o motor do Ai DEV usa SQLite (não portado — ver abaixo).

**Deliberadamente não portado** (por princípio geral já estabelecido nas rodadas anteriores, não por citação específica desta pesquisa incompleta): SQLite (Postgres real); `project_id`/`workspace_id` como dimensão de tenant (`tenantId` real sob RLS); qualquer assunção de instalação única; estruturas específicas de desenvolvimento de software (work steps, ciclos, worktree paths) — nenhuma tem análogo em um motor de jobs de CRM/produto e foram deixadas inteiramente de fora.

## 3. Arquitetura

`packages/db/src/jobs/`: `types.ts` (`JobDefinition`, `JobExecutionContext`, `FalhaJob`, `BloqueioGateNecessario`), `registry.ts` (`Map` em memória, default-deny — mesmo padrão do Tool Registry de T3), `backoff.ts` (funções puras: `calcularBackoffMs`, `prioridadeEfetiva`), `engine.ts` (o motor completo). Definições de job que precisam de código específico da aplicação (o cliente HTTP da Cloud API do WhatsApp) vivem em `apps/web/src/lib/jobs/definitions/` — decisão arquitetural análoga a T3: o motor genérico nunca depende de `apps/web`, só o inverso. `packages/db` ganhou `zod` como dependência própria (já usada em `apps/web`, versão idêntica) para os `payloadSchema` dos `JobDefinition`.

## 4. Schema/migrations

Duas migrations, mesmo padrão em 2 passos de T1/PM-BLOQ-001/T2/T3:
1. `20260910230000_job_engine` — schema aditivo: enums `JobStatus`/`ExecutionStatus`, tabelas `jobs`/`executions`.
2. `20260910230100_enable_rls_job_engine` — RLS (`tenant_isolation` em ambas) + trigger de imutabilidade condicional de `Execution` (bloqueia UPDATE/DELETE só depois de terminal — SUCCEEDED/FAILED/TIMEOUT; RUNNING continua mutável pra heartbeat/lease), com a mesma exceção `rls_bypass()` de sempre para cascade delete de Tenant.

`Job`: `id`, `tenantId`, `type`, `payload` (Json), `status`, `priority`, `attempts`, `maxAttempts`, `idempotencyKey` (`@@unique([tenantId, idempotencyKey])`), `scheduledFor`, `dependsOnJobId` (FK composta, auto-relação), `gateId`/`blockedReason`/`resumeState` (blocked/resume), `leaseOwner`/`leaseExpiresAt`, `lastError`, `source`. `Execution`: `id`, `tenantId`, `jobId`, `attemptNumber`, `status`, `workerId`, `leaseExpiresAt`, `heartbeatAt`, `startedAt`/`finishedAt`, `error`, `resultado`, `duracaoMs`.

## 5. Máquina de estados

`JobStatus { PENDING, READY, RUNNING, BLOCKED, RETRY_WAIT, SUCCEEDED, FAILED, DEAD_LETTER, CANCELLED }` — exatamente os 9 estados que a autorização listou, nenhum a mais (T5 §4: "usar somente estados realmente necessários"). `ExecutionStatus { RUNNING, SUCCEEDED, FAILED, TIMEOUT }` — menor, porque Execution não precisa representar bloqueio/dependência (isso é conceito de Job). Transições inválidas nunca são possíveis por construção: `executarJobReivindicado`/sweeps só escrevem os estados que fazem sentido a partir de onde o Job já está, e toda escrita de estado passa por `updateMany` condicional (`WHERE status = '<estado esperado>'`) — uma tentativa de transição a partir de um estado errado simplesmente não afeta nenhuma linha (mesmo padrão de defesa que `decidirGate` já usa em T1), não precisa de uma tabela de transições explícita separada.

## 6. Job Registry

`Map<string, JobDefinition>` em memória, populado uma vez por processo (cache de módulos do Node) — mesmo padrão exato do Tool Registry de T3. `type` não registrado nunca executa: `submeterJob` lança na submissão (default-deny na entrada), e se um Job já enfileirado tiver seu `type` removido entre deploys, `reivindicarProximoJob` o move direto para `DEAD_LETTER` em vez de travar o worker.

## 7. Job/Execution

Separação real: um `Job` pode ter várias `Execution` (uma por tentativa, `attemptNumber` incremental) — nunca sobrescreve a tentativa anterior. `Execution` é imutável depois de terminal (trigger de banco, não só convenção de aplicação) — importante para auditoria/diagnóstico: o histórico completo de tentativas fica preservado mesmo que o Job em si mude de estado várias vezes.

## 8. Claim

`SELECT id FROM jobs WHERE status IN ('READY','RETRY_WAIT') AND scheduled_for <= now() ORDER BY (prioridade efetiva) DESC, scheduled_for ASC FOR UPDATE SKIP LOCKED LIMIT 1`, seguido de um `UPDATE` que seta `RUNNING`/`leaseOwner`/`leaseExpiresAt`/incrementa `attempts`, tudo dentro da mesma transação `withSystem` (o worker é cross-tenant por natureza — processa jobs de qualquer tenant; o handler em si roda com `ctx.tenantId` vindo da própria linha do Job, nunca do payload).

**Achado real desta rodada, corrigido**: a sessão Postgres roda com `timezone=America/Sao_Paulo`. Comparar uma coluna `TIMESTAMP` sem timezone (default do Prisma para `DateTime`) contra `now()` em SQL bruto faz o Postgres converter `now()` para o fuso da sessão antes de descartar o offset — a primeira versão do claim nunca encontrava nenhum candidato, mesmo com linhas óbvias prontas (confirmado por depuração direta: `scheduled_for <= now()` avaliava `false` para uma linha criada minutos antes). Prisma's próprio query builder (usado em todo o resto do projeto, ex. `Gate.expiresAt: {lte: new Date()}`) não sofre disso — o parâmetro é vinculado de forma consistente, não pelo `now()` textual dependente de sessão. Corrigido com `AT TIME ZONE 'UTC'` nos dois pontos que comparam/subtraem essas colunas contra `now()` (WHERE do claim + cálculo de aging no ORDER BY). Verificado como específico desta rodada: T2/T3 usam SQL bruto só para **atribuir** `now()` (nunca compará-lo contra uma coluna existente), então nunca bateram nesse problema.

## 9. Lease/heartbeat

`leaseExpiresAt = now() + timeoutMs(do JobDefinition) + margem(5s)`, setado no claim. `heartbeatJob(tenantId, jobId, attemptNumber, workerId)` renova via `UPDATE Execution ... WHERE status='RUNNING' AND workerId=$worker` — devolve `false` se o worker não for mais dono (fencing real, testado: um worker que nunca reivindicou o Job recebe `false`, nunca renova o que não é seu).

## 10. Retry/backoff

`calcularBackoffMs(tentativa, base, max) = min(base * 2^(tentativa-1), max)` — pura, testada (dobra a cada tentativa, nunca ultrapassa o teto). `FalhaJob(mensagem, "RETRYABLE"|"PERMANENTE")` classifica explicitamente; exceção genérica (não classificada pelo handler) é tratada como `RETRYABLE` por padrão (mais seguro que perder um retry legítimo por engano de classificação). `PERMANENTE` nunca tenta de novo, mesmo com tentativas restantes — testado.

## 11. Dead-letter

Esgotado `maxAttempts` numa falha ainda classificada `RETRYABLE` → `DEAD_LETTER`. `lastError` guarda o erro sanitizado (truncado a 500 caracteres, nunca stack trace completo, nunca segredo — testado com regex negativo em `lastError`). `attempts` e a `Execution` da última tentativa ficam preservados para diagnóstico. Reenvio manual (`reenviarJobManualmente`, RBAC `jobs.manage`) zera tentativas e volta o Job para `READY`.

## 12. Idempotência

Dois problemas distintos, tratados separadamente (T5 §13 pediu isso explicitamente):
- **Submissão**: `Job.idempotencyKey` (`@@unique([tenantId, idempotencyKey])`, NULL distinto no Postgres — só ativa quando informado). Testado: mesma chave duas vezes → um único Job, segunda chamada devolve `duplicado: true`.
- **Handler/side effect**: responsabilidade de cada `JobDefinition`. O primeiro caso real documenta honestamente (código e README) que isto NÃO elimina a ambiguidade inerente de um retry sobre uma API externa não-idempotente (ver seção 18).

## 13. Prioridade/fairness, dependência, blocked/resume

**Prioridade**: `priority` (Int) + aging (+1 a cada 5min de espera, teto +50), calculado tanto em SQL (claim real) quanto numa função pura testável (`prioridadeEfetiva`) — testado que prioridade baixa esperando o bastante ultrapassa prioridade alta recém-chegada (anti-starvation, T5 §16).

**Dependência**: ponteiro único (`dependsOnJobId`), não um DAG completo (T5 §17 pediu só implementar se realmente necessário). Job com dependência nasce `PENDING`; um sweep (`resolverDependenciasPendentes`, cross-tenant via `withSystem`, chamado no início de todo claim) promove para `READY` quando a dependência conclui com sucesso, ou cancela automaticamente (`CANCELLED`, `blockedReason` explicando o motivo) quando a dependência falha terminalmente — nunca fica pendente para sempre. Testado nos dois casos.

**Blocked/resume via Gate**: um handler pode lançar `BloqueioGateNecessario(categoria, acaoProposta, motivo)` — o Job vira `BLOCKED`, um Gate real de T1 é criado (reaproveitando a infraestrutura existente, nunca um segundo sistema de aprovação — T5 §19 explícito sobre isso), e um sweep (`resolverJobsBloqueadosPorGate`) resolve depois: aprovado → retoma para `resumeState` (`READY`); rejeitado/expirado → `CANCELLED`. Testado com um cenário controlado (nenhuma tool de Camada 3 real foi criada só para provar isto, como a autorização também pediu explicitamente para T1/T3).

## 14. Gate

Ver seção 13 acima. Isolamento cross-tenant do bloqueio testado: o Gate de um Job do tenant A nunca é visível/consultável a partir do tenant B.

## 15. Cost Control

Nenhuma mudança destrutiva em T2. Responsabilidades continuam separadas (T5 §20/§21): se um job type futuro chamar IA, cada model call dentro dele deveria passar pelo PRE-CHECK/`registrarCostEvent` de T2 — nenhum job desta rodada chama IA (o único job real, `whatsapp.enviar_mensagem`, é uma chamada de rede à Cloud API, sem custo de IA associado), então não havia integração de fato a fazer nesta rodada além de preservar o contrato (o handler recebe `PrismaClient` puro, nada impede uma `JobDefinition` futura de chamar `preCheckCusto`/`registrarCostEvent` normalmente).

## 16. Tool Broker

Nenhuma mudança em T3. Responsabilidades separadas por design (T5 §21): Tool Broker decide "pode executar?", Job Engine decide "quando/como executar com confiabilidade?". Nenhuma tool de T3 foi convertida em Job — todas continuam síncronas (são operações de banco simples, adequadas a execução síncrona).

## 17. Primeiro caso real

`whatsapp.enviar_mensagem` (`apps/web/src/lib/jobs/definitions/whatsapp-enviar-mensagem.ts`) — escolhido entre as duas opções sugeridas pela autorização (reenvio de WhatsApp vs. follow-up agendado) porque o código atual confirmou (README linha ~733, citado na própria autorização) um mecanismo `setInterval` de processo único já documentado como limitação conhecida, e porque o webhook do WhatsApp (`apps/web/src/app/api/webhooks/whatsapp/route.ts`) tinha uma lacuna real e concreta: a resposta automática do Yalla, ao falhar por uma instabilidade transitória de rede, era simplesmente perdida (só um `console.error`, sem retry). Agora o webhook `submeterJob` em vez de chamar `sendCloudText` direto — `idempotencyKey` correlacionado com o id da mensagem recebida da Meta (defesa em profundidade sobre a deduplicação que `ingestWhatsappMessage` já faz mais cedo), `priority: 10` (mensagem de cliente é alta prioridade, exemplo dado pela própria autorização em T5 §16).

## 18. Worker

`apps/web/src/scripts/job-worker.ts` — processo separado da request HTTP (`pnpm --filter web worker`), poll a cada 1s, PostgreSQL como o próprio backend da fila (T5 §25 permite isso explicitamente, sem exigir Redis/broker externo). Loop simples: reivindica → executa → repete imediatamente se havia trabalho, ou espera o intervalo de poll se a fila estava vazia. `SIGINT`/`SIGTERM` tratados para encerramento limpo. **Não foi iniciado/supervisionado automaticamente por esta sessão** — decisão operacional de deploy (systemd/PM2/processo separado em produção) fica fora do escopo desta rodada, documentada como limitação.

## 19. Observabilidade

`contarJobsPorStatus`/`listarJobsRecentes` (`packages/db/src/jobs/engine.ts`) — usados pela UI mínima em `/jobs`. Nenhum Command Center construído (T5 §29 explicitamente não pediu isso).

## 20. Segurança

Testado adversarialmente (não só "não vi quebrar"):
- **Cross-tenant/IDOR**: Tenant B não lê Job/Execution do Tenant A (RLS); Tenant B não consegue cancelar Job do Tenant A; Gate de bloqueio de um tenant nunca visível de outro.
- **Tenant injection**: `ctx.tenantId` do handler vem sempre da linha do Job (nunca do payload) — a própria arquitetura torna impossível o payload sobrescrever o tenant (não há nem um campo `tenantId` nos payloads dos job types desta rodada).
- **Job type injection**: `type` desconhecido nunca executa (default-deny testado).
- **Payload malicioso**: validado por Zod na submissão — payload inválido nunca cria um Job.
- **Duplicate submission/replay**: idempotencyKey testado (submissão e nível de mensagem WhatsApp).
- **Race claim**: `SKIP LOCKED` testado com concorrência real (`Promise.all`) e com um teste de carga de 100 jobs/8 workers simultâneos — zero duplicados, zero perdidos.
- **Stale lease/stale worker/double completion**: testado ponta a ponta (seção 9 acima) — fencing real via `updateMany...WHERE status='RUNNING' AND leaseOwner/workerId=$worker`.
- **Retry storm**: backoff exponencial com teto testado; falha permanente nunca retry.
- **Secret em erro/metadata sensível**: `lastError` testado para não conter `secret|token|password`; evento de Audit testado para nunca conter o payload bruto do Job (marcador sensível de teste nunca aparece em `AuditLog.detalhe`).
- **Gate bypass**: consumo de autorização de Gate segue exatamente o mesmo mecanismo já comprovado em T2 (não foi alterado); nenhum job desta rodada usa Gate de verdade, mas o cenário controlado prova que bloqueio/retomada/rejeição funcionam.
- **Cancel sem permissão**: `cancelarJobAction`/`reenviarJobAction` exigem `jobs.manage` (RBAC), testado no padrão já estabelecido pelas outras actions administrativas.

## 21. Testes novos

- `packages/db/tests/unit/jobs.test.ts` — **7** (backoff exponencial, prioridade efetiva/aging).
- `packages/db/tests/integration/job-engine.test.ts` — **33** (registry default-deny, idempotência de submissão, RLS ×3, claim atômico ×2 incluindo N=20/M=5, execução sucesso/falha-retryable/falha-permanente/timeout, dead-letter ×2, lease/heartbeat/crash-recovery/stale-worker ×5, imutabilidade de Execution ×4, dependência ×3, Gate ×4, prioridade, observabilidade, Audit sem payload bruto, **teste de carga de 100 jobs**).
- `apps/web/tests/integration/job-whatsapp-resend.test.ts` — **4** (caminho feliz, falha transitória→retry→sucesso sem duplicar a Message, idempotência de submissão, janela de 24h como falha permanente).

Total: **44 testes novos**, todos passando. `fetch` sempre mockado — nenhuma chamada real ao WhatsApp/IA em nenhum teste deste bloco.

## 22. Teste de carga

100 Jobs criados, 8 workers "concorrentes" disputando repetidamente via `Promise.all` até a fila esvaziar (mesmo padrão de teste real usado nos testes de claim atômico, não um mock de concorrência): **100 reivindicados, 100 concluídos (`SUCCEEDED`), 0 duplicados, 0 perdidos**, ~2.5-2.8s de tempo total (ambiente local, sem chamada de rede real — os jobs de teste são handlers síncronos triviais). Resultado impresso no console do próprio teste (`[T5 teste de carga] criados=100 reivindicados=100 succeeded=100 duplicados=0 perdidos=0 tempo=~2700ms`). Volume escolhido dentro da faixa sugerida (100-1000) — suficiente para revelar qualquer race real no claim atômico sob o SKIP LOCKED, sem precisar de API externa paga nem de infraestrutura extra.

## 23. Regressão

Tenant Core, Auth, RBAC, CRM, Kanban, Lead Capture, WhatsApp, Inbox, Yalla, T1 Gates/Audit, SecretProvider, T2 Cost Control, T3 Tool Broker, KeroCar — todos os testes pré-existentes continuam passando. **337/337 testes** (221 em `packages/db`: 52 unit + 169 integration; 116 em `apps/web`), subindo de 293 antes desta rodada (+44, exatamente os testes novos de T5). Uma flake real de infraestrutura de teste foi observada e confirmada como pré-existente/não-relacionada a T5: dois arquivos de teste de `apps/web` (`gates-route.test.ts`, `secret-provider-wiring.test.ts`) fazem `upsert` concorrente do catálogo de `Permission` em `beforeAll` quando vitest roda arquivos em paralelo — uma corrida de constraint única entre processos de teste diferentes, não uma falha determinística; uma segunda execução do mesmo comando passou 100%. Não é um problema introduzido por T5 nem foi corrigido nesta rodada (fora do escopo autorizado — seria uma mudança em infraestrutura de teste de blocos anteriores).

## 24. Typecheck/build

Typecheck limpo em `packages/db` e `apps/web` (`tsc --noEmit`, 0 erros). Build de produção limpo (`next build`, 22 rotas incluindo a nova `/jobs`, exit code 0).

## 25. Limitações

- Timeout de job não cancela de fato o trabalho subjacente da Promise (mesma limitação honesta de T3) — aceitável aqui porque nenhum handler desta rodada tem chamada de rede sem timeout próprio (a Cloud API do WhatsApp já tem timeout implícito via `fetch`).
- Dependência é um ponteiro único, não um DAG completo — não é um orquestrador de workflows genérico.
- Pesquisa do Ai DEV para este bloco específico não completou (rate limit da API) — o desenho reaproveita os princípios já validados nas pesquisas de T2/T3 e nos padrões já comprovados neste repositório, não uma extração de código-fonte específica desta vez (registrado com honestidade na seção 2).
- Nenhuma UI de configuração de retry/backoff por job type (vive só em código, no `JobDefinition`) — decisão deliberada de manter a UI mínima (T5 §29).
- Worker não é supervisionado/iniciado automaticamente — decisão de infraestrutura de deploy explicitamente fora do escopo desta rodada.
- Reenvio de WhatsApp não elimina a ambiguidade "retry após confirmação perdida pode duplicar do lado do cliente final" — limitação inerente de qualquer sistema at-least-once sobre uma API externa não-idempotente, documentada honestamente no código e no README, não escondida nem apresentada como resolvida.
- Achados/limitações de rodadas anteriores permanecem sem mudança: nenhum preço de produção em `ModelPrice` (T2), sem conversor de moeda, expiração de Gate como sweep preguiçoso (T1), nenhuma UI de `AgentGrant` (T3).

## 26. Status Git

Este repositório **continua sem inicialização git** (`fatal: not a git repository`, reconfirmado nesta rodada). Não há branch, HEAD nem commits a reportar. `git init` não foi executado.

**GIT NÃO INICIALIZADO.**

## 27. Veredito

**T5 CONCLUÍDO.**

Checklist do Gate Final (todos verdadeiros): Job Registry existe (default-deny testado); job type é allowlisted; Job tenant-scoped existe (RLS testada); Execution history existe (imutável depois de terminal, testado); claim é atômico (`SKIP LOCKED`, testado com concorrência real e teste de carga); lease funciona (testado); heartbeat funciona (testado, incluindo rejeição de worker que nunca foi dono); crash recovery funciona (testado ponta a ponta: lease vencido → sweep recupera → Execution órfã fecha como TIMEOUT); stale worker é rejeitado (testado: worker antigo não consegue confirmar sucesso depois de outro assumir); retry/backoff funciona (testado, incluindo distinção retryable/permanente); dead-letter funciona (testado); idempotência funciona (submissão e handler documentado); multi-worker foi testado (N=20/M=5 e teste de carga N=100/M=8); Gate T1 integrado (testado: bloqueio, aprovação→retomada, rejeição→cancelamento, isolamento cross-tenant); Cost/Tool Broker responsabilidades continuam separadas (nenhuma mudança destrutiva, testado que nada quebrou); pelo menos 1 caso real usa o motor (`whatsapp.enviar_mensagem`, testado ponta a ponta incluindo cenário de retry real com espera de backoff); RLS passa (testado); RBAC passa (`jobs.view`/`jobs.manage`, mesmo padrão das outras rodadas); Audit funciona (testado, nunca payload bruto); regressão passa (337/337); typecheck passa; build passa.

## 28. Recomendação do próximo bloco

Segundo o plano mestre e a decisão de ordem explícita desta rodada, o próximo bloco natural é **T4 — Model Router**, agora que o Job Engine (T5) existe e pode servir de base para qualquer necessidade futura de execução assíncrona de chamadas de modelo (retry/fallback de provider fora do caminho síncrono atual, se algum dia for necessário). O provider simples do Yalla (1 provider por tenant, timeout+retry síncrono) continua resolvendo o caso de uso atual — o Router só compensaria o esforço com necessidade real de multi-provider (fallback automático em pico de uso, seleção por custo em escala), que ainda não existe neste produto. Aguardando autorização explícita — **T4 não foi iniciado automaticamente**.

---

PARAR. NÃO iniciar T4 automaticamente.
