# T5-FIX — Hardening Final do Job/Execution Engine — Relatório de Fechamento

Escopo autorizado: rodada curta de correção/verificação sobre o T5 já implementado (`RELATORIO-FECHAMENTO-T5.md`, veredito "T5 CONCLUÍDO"), antes de declará-lo definitivamente concluído. Nenhum T4 iniciado, `git init`/`push` não executados.

---

## 1. Timeout HTTP — antes/depois

**Antes**: `sendCloudText`/`post` (`apps/web/src/lib/whatsapp/cloud-api.ts`) chamavam `fetch` sem nenhum `signal`. O Job Engine (`comTimeout`, `packages/db/src/jobs/engine.ts`) parava de **esperar** o handler via `Promise.race` quando `timeoutMs` estourava, mas nunca cancelava a chamada de rede em si — uma requisição HTTP pendurada continuava rodando "no fundo", indefinidamente, sem que ninguém a interrompesse (mesma limitação documentada, e aceita, em T3 pro Tool Broker).

**Depois**: `post`/`sendCloudText` ganharam um parâmetro `signal?: AbortSignal` opcional, passado direto pro `fetch(url, {..., signal})`. O Job Engine cria um `AbortController` por execução (`executarJobReivindicado`) e expõe `controller.signal` via `ctx.signal` (novo campo de `JobExecutionContext`). Quando `timeoutMs` estoura, o motor chama `controller.abort(erro)` — a chamada de rede é cancelada de verdade, não só ignorada.

## 2. Propagação de AbortSignal

`whatsapp.enviar_mensagem` (`apps/web/src/lib/jobs/definitions/whatsapp-enviar-mensagem.ts`) passa `ctx.signal` pra `sendCloudText`. Testado em dois níveis:

- **Genérico (motor)**: `packages/db/tests/integration/job-engine.test.ts`, describe "Timeout — AbortSignal real" — um job type de teste cujo handler só resolve/rejeita quando `ctx.signal` dispara `abort`; comprovado que o signal recebido pelo handler tem `.aborted === true` depois da execução, e que a duração real fica bem abaixo do "nunca resolve" do handler (prova que o abort aconteceu de verdade, não que o motor só desistiu de esperar).
- **Específico (WhatsApp)**: `apps/web/tests/integration/job-whatsapp-resend.test.ts`, describe "timeout HTTP real via AbortSignal" — mock de `fetch` que só resolve quando o `signal` recebido dispara `abort` (nunca sozinho); comprovado que a `Execution` fecha como `TIMEOUT`, o `Job` vai pra `RETRY_WAIT` (não `DEAD_LETTER` — é a 1ª tentativa), e nenhuma `Message` de saída foi gravada (o envio genuinamente não completou).

Um segundo teste (`nenhuma promise órfã gera unhandled rejection quando o handler é abortado`) instala um listener em `process.on("unhandledRejection")` durante a execução e confirma zero ocorrências — a promise original do handler sempre tem `.then(onFulfilled, onRejected)` anexado pelo `comTimeout`, então perder a corrida contra o timeout nunca vira um warning silencioso.

**Limitação que permanece, documentada honestamente** (código + README): abortar a conexão local não desfaz uma mensagem que a Meta já tenha recebido e processado do lado dela antes do abort chegar. Se a confirmação (resposta HTTP) se perder por qualquer motivo antes de gravarmos a Execution como `SUCCEEDED`, um retry pode duplicar a mensagem do lado do cliente final — ambiguidade genuinamente inerente a qualquer sistema at-least-once sobre uma API externa não-idempotente (a Cloud API não aceita idempotency key pra texto livre), não uma lacuna deste motor. O que o motor garante é que o mesmo Job nunca reexecuta por bug/race nosso (idempotencyKey na submissão + fencing de lease, ambos já comprovados em T5).

## 3. Worker health/observabilidade

Tabela global `WorkerHeartbeat` (`worker_id`, `started_at`, `last_heartbeat_at`, `jobs_processados`) — sem `tenantId`/RLS, mesmo tratamento de `ModelPrice` (T2): worker é infraestrutura, não dado de tenant. `registrarHeartbeatWorker` grava/atualiza a própria linha; `apps/web/src/scripts/job-worker.ts` chama isso imediatamente ao iniciar (aparece como ativo sem esperar) e depois a cada 5s no máximo (não a cada poll de 1s, pra não sobrecarregar o banco só com heartbeat) — sempre bem abaixo do teto de 15s (`WORKER_HEARTBEAT_STALE_MS`) que marca um worker como "possivelmente parado".

`obterSaudeFila` (nova função de `packages/db/src/jobs/engine.ts`) devolve: lista de workers com `ativo` derivado na leitura (nunca um booleano armazenado, que ficaria desatualizado sozinho), `nenhumWorkerAtivo`, idade do Job `READY` mais antigo (`readyMaisAntigoIdadeMs`, null quando não há nenhum — nunca inventa uma idade) e contagens globais (`READY`/`RETRY_WAIT`/`DEAD_LETTER`/`RUNNING`, todos os tenants — um worker parado afeta todo mundo).

UI: nova seção "Saúde da fila" no topo de `/jobs`, acima dos contadores por status já existentes — mensagem em destaque vermelho quando nenhum worker está ativo, lista de workers com badge ativo/parado, e aviso quando o Job `READY` mais antigo está esperando há mais de 60s. **Verificado visualmente no navegador**: com nenhum worker rodando, mostra "Nenhum worker ativo detectado — jobs não estão sendo processados."; com o worker rodando (`pnpm --filter web worker`, iniciado e parado manualmente pra este teste), mostra "1 worker(s) ativo(s)" com o `workerId` real e o heartbeat mais recente.

Documentado no cabeçalho de `job-worker.ts` e no README: **WEB PROCESS + JOB WORKER são os dois processos obrigatórios do deployment** desde que `whatsapp.enviar_mensagem` existe — o webhook só enfileira, quem entrega de verdade é o worker.

Testes novos (`packages/db/tests/integration/job-engine.test.ts`, describe "Worker health"): worker recém-heartbeat aparece ativo; worker com heartbeat antigo (>15s) aparece parado; `nenhumWorkerAtivo` reflete isso; `jobsProcessados` incrementa corretamente; idade do Job `READY` mais antigo é calculada corretamente entre tenants (visão global).

## 4. Correções do README

Nova seção **"Estado atual (leia isto primeiro)"** logo após a introdução — lista explicitamente o que já está implementado (Yalla com tool-calling real, secrets fora de texto plano, fila/Job Engine real, T3/T5 concluídos) e avisa que as seções abaixo são histórico da fundação, não "o que falta". Correções pontuais, preservando o texto original riscado (`~~texto~~`) + nota, em vez de apagar:

- **Introdução**: "T4-T5 ainda não foram autorizados" → T5 listado como concluído, só T4 continua pendente.
- **Seção WhatsApp**: "fila real para reenvio... ainda não resolvida aqui" → marcado resolvido em T5.
- **Seção Yalla**: "Sem tool-calling ainda" → nota de que isso mudou em T3, com referência cruzada; "chave em texto plano por ora" → nota de que isso mudou em PM-BLOQ-001; título da seção ganhou "(histórico da fundação — ver Estado atual)".
- **Seção T5**: contagem de testes de `job-whatsapp-resend.test.ts` atualizada (4→5, incluindo o teste de abort novo); item de "Limitações" sobre timeout corrigido (resolvido pra handlers que propagam o signal); nova subseção "T5-FIX" resumindo esta própria rodada.

Não apagou nenhum histórico — cada correção preserva o texto original riscado com uma nota ao lado, e a nova seção "Estado atual" existe justamente pra não precisar reescrever/remover o restante do documento.

## 5. Correção da flake

**Causa raiz confirmada**: `vitest run` roda múltiplos arquivos de teste em paralelo por padrão, cada um com sua própria conexão Prisma. Nove arquivos de teste (`apps/web/tests/integration/{gates-route,secret-provider-wiring,cost-policy-rbac,vehicle-device-edit-route,vehicle-edit-route,vehicle-maintenance-route,vehicle-provisioning-route,vehicle-device-status-route,vehicle-rotate-key-route}.test.ts`) repetiam o mesmo `for (const perm of PERMISSIONS) { await prisma.permission.upsert(...) }` no próprio `beforeAll` — duas conexões concorrentes podiam ver "a permissão não existe" ao mesmo tempo e ambas tentarem `INSERT`, uma recebendo `Unique constraint failed on the fields: (chave)` em vez do upsert resolver silenciosamente (confirmado nos logs reais de `gates-route.test.ts`/`secret-provider-wiring.test.ts` antes desta rodada).

**Correção**: `apps/web/tests/helpers/garantir-permissoes.ts` — `INSERT INTO permissions (...) VALUES (...) ON CONFLICT (chave) DO NOTHING`, mesmo padrão atômico já comprovado em `cost-control.ts::ajustarCostUsage`/`tools/broker.ts::reservarToolCall`. Não muda nenhuma regra de negócio (o catálogo continua vindo de `PERMISSIONS`, só a forma de semeá-lo sob concorrência real em teste muda) — os 9 arquivos foram atualizados pra importar e chamar `garantirPermissoes(prisma)` em vez do loop inline.

**Verificação**: `pnpm --filter web test` rodado **3 vezes seguidas** (mais uma quarta vez depois da verificação visual manual) — 22 arquivos, 121 testes, 100% verde nas 4 execuções, nenhuma falha de constraint. A flake não ocorreu mais nenhuma vez.

## 6. Auditoria global de timestamps

Busca por `now()`/`CURRENT_TIMESTAMP` em todo `packages/db/src/*.ts` e `apps/web/src/*.ts` (raw SQL). Resultado:

- `packages/db/src/cost-control.ts` (`ajustarCostUsage`, `rotacionarSecret`... consumo de gate) e `packages/db/src/tools/broker.ts` (`reservarToolCall`) usam `now()` **só para atribuir** (`VALUES (..., now())`, `updated_at = now()`) — nunca para comparar contra uma coluna já armazenada. Sem risco: atribuição não sofre do problema de timezone (só comparação sofre, porque o Postgres precisa decidir COMO interpretar o valor naive armazenado na hora de comparar, e é aí que o fuso da sessão entra).
- `packages/db/src/jobs/engine.ts` (`reivindicarProximoJob`) é o **único** lugar que compara/subtrai colunas `TIMESTAMP` (sem timezone) contra `now()` em SQL bruto — exatamente o bug real já encontrado e corrigido durante a implementação original de T5 (`AT TIME ZONE 'UTC'` nos dois pontos: `WHERE (scheduled_for AT TIME ZONE 'UTC') <= now()` e `EXTRACT(EPOCH FROM (now() - (created_at AT TIME ZONE 'UTC')))`).
- Todo o resto do código (`Date.now()`/`new Date()` em `gates.ts`, `session.ts`, `rate-limit.ts`, `tarefas.ts`, criação de `expiresAt`/`scheduledFor`/etc.) usa **comparação via o query builder do Prisma** (`{lte: new Date()}` etc.), que vincula o parâmetro de forma consistente com o tipo da coluna — não usa a função textual `now()` dependente do `timezone` de sessão, e portanto não sofre deste bug.

**Nenhuma outra instância do problema foi encontrada.** A correção original de T5 já cobria o único caso real existente no repositório; esta auditoria confirma isso com evidência, não apenas reafirma por suposição.

## 7. Testes adicionados

- `packages/db/tests/integration/job-engine.test.ts`: **+7** (2 de AbortSignal real + 5 de worker health).
- `apps/web/tests/integration/job-whatsapp-resend.test.ts`: **+1** (timeout HTTP real via AbortSignal, usando um job type de teste com o mesmo handler real e `timeoutMs` curto pra não deixar a suíte lenta).
- `apps/web/tests/integration/job-actions-rbac.test.ts`: **+4** — RBAC de `cancelarJobAction`/`reenviarJobAction` (`jobs.manage`), iniciado pelo usuário via a sugestão de cobertura sinalizada durante esta mesma rodada; segue exatamente o padrão de `cost-policy-rbac.test.ts` e usa o novo `garantirPermissoes`.

Total: **12 testes novos** nesta rodada (T5-FIX), todos passando.

## 8. Total final de testes

**349 testes** (52 unit + 176 integration em `packages/db`; 121 em `apps/web`) — subindo de 337 antes desta rodada (293 de T1-T3 + 44 de T5, +12 de T5-FIX).

## 9. Regressão repetida

- `packages/db` unit: 1 execução, 52/52.
- `packages/db` integration: 2 execuções seguidas, 176/176 nas duas.
- `apps/web`: **4 execuções seguidas** (incluindo a verificação após a checagem visual manual no navegador, que também escreve no banco), 121/121 em todas — critério do item 6 da autorização ("executar mais de uma vez... procurar a antiga flake") cumprido com folga.

Nenhuma regressão em Tenant Core, Auth, RBAC, CRM, WhatsApp, Inbox, Yalla, T1, SecretProvider, T2, T3, KeroCar, T5.

## 10. Typecheck/build

Typecheck limpo em `packages/db` e `apps/web` (`tsc --noEmit`, 0 erros) — checado tanto logo após as mudanças de código quanto no final, depois de todos os testes. Build de produção limpo (`next build`, 22 rotas, mesmo conjunto de antes — nenhuma rota nova nesta rodada, só a UI de `/jobs` foi ampliada — exit code 0).

## 11. Limitações restantes

- Ambiguidade inerente de duplicação em retry sobre API externa não-idempotente (WhatsApp) — não é resolvível por este motor, só mitigável (ver item 2). Documentada, não escondida.
- Timeout ainda não cancela handlers que não propagam `ctx.signal` pra dentro de uma operação assíncrona (ex.: uma query de banco em andamento sem suporte a cancelamento nativo) — o abort funciona pra HTTP porque `fetch` suporta `AbortSignal` nativamente; uma chamada que não suporta continua só "abandonada" no sentido de que o motor para de esperar por ela.
- Worker health é observabilidade, não supervisão automática — ninguém reinicia o worker sozinho nem dispara um alerta externo quando ele para; um humano olhando `/jobs` (ou uma integração futura de monitoramento) é quem precisa agir.
- `WORKER_HEARTBEAT_STALE_MS` (15s) e o intervalo de escrita de heartbeat (5s) são constantes fixas no código, não configuráveis por env/tenant — decisão deliberada de manter simples (T5-FIX não é o lugar de construir configuração de infraestrutura).
- Achados/limitações de rodadas anteriores permanecem sem mudança: dependência é ponteiro único (não DAG), nenhuma UI de retry/backoff por job type, nenhum preço de produção em `ModelPrice`, sem conversor de moeda, expiração de Gate como sweep preguiçoso, nenhuma UI de `AgentGrant`.

## 12. Status Git

Este repositório **continua sem inicialização git** (`fatal: not a git repository`, reconfirmado no início desta rodada). Não há branch, HEAD nem commits a reportar. `git init` não foi executado.

**GIT NÃO INICIALIZADO.**

---

## VEREDITO FINAL

**T5 CONCLUÍDO.**

Os 4 pontos que a auditoria abriu antes de declarar T5 definitivamente fechado foram todos endereçados com evidência real (não só afirmação): timeout HTTP agora aborta de verdade e é testado com um mock que só resolve sob abort; worker health existe e foi verificado tanto por teste automatizado quanto visualmente no navegador nos dois estados (ativo/nenhum ativo); a fonte de verdade do README foi corrigida sem perder o histórico; a flake de concorrência entre arquivos de teste foi eliminada na raiz e confirmada estável em 4 execuções seguidas; a auditoria global de timestamps não encontrou nenhum outro caso do bug de timezone além do já corrigido em T5. 349/349 testes, typecheck limpo, build limpo.

PARAR.

NÃO iniciar T4 automaticamente.
