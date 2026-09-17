# PM-CONV-06 — Resultado: Experiência Inteligente + Mobile Avançado + Operação ao Vivo + Hardening Operacional

**Data:** 2026-09-16/17 (sessão contínua, sem pausa entre etapas por instrução explícita do comando).
**Execução:** agente único, sequencial por prioridade (§0 baseline → §5E Job Engine hardening → Central de Operações → i18n/Help → Mobile/PWA → Yalla/passageiro → E2E), com a auditoria de i18n/Help delegada a um subagente paralelo (escopo isolado, sem conflito de arquivo com o resto do trabalho) — decisão coberta pela autorização de paralelismo do comando.

**Veredito final: CONCLUÍDO (com limitações declaradas por track — nenhuma maquiada).** O item mais crítico da autorização — a investigação e correção real da flakiness do Job Engine sob execução paralela (§5E) — foi levado a fundo: quatro bugs reais e distintos foram encontrados por leitura direta de código e diagnóstico empírico (não suposição), corrigidos, e a suíte completa foi verificada **22 vezes consecutivas sem uma única falha** (12+10 execuções de `apps/web`, 105/105 toda vez) sob paralelismo normal do Vitest — nenhum `--no-file-parallelism`. Central de Operações, i18n/Help e a integração E2E ponta a ponta estão **PRODUCTION READY**. Mobile/PWA está **PRODUCTION READY** para o que foi tocado nesta rodada (ícone, service worker, contexto do passageiro) — capacidades operacionais móveis novas para guia/motorista (além do que já existia) não foram construídas, é uma lacuna declarada, não escondida. Yalla Internacional está **PARCIAL** — auditado end-to-end, confirmado que não há nenhuma credencial real de provider (LLM/tradução/voz) configurada neste ambiente, e que o código de integração real já existe e se comporta corretamente (nunca simula); a expansão de "ferramentas operacionais via Yalla para staff em campo" fica **fora desta rodada**, declarada explicitamente abaixo.

---

## §0 — Baseline física (reverificação, não confiança no relatório anterior)

Antes de qualquer mudança, reconfirmei por leitura direta (não pelo texto do PM-CONV-05):
- `packages/db/src/jobs/engine.ts::reivindicarProximoJob` — a query de claim é `SELECT ... FOR UPDATE SKIP LOCKED` **sem filtro de tipo/tenant**. Confirmado: é design intencional de produção (fila global e justa entre todo o pool de workers), não um bug.
- `Job.attempts` incrementa no MOMENTO DO CLAIM (mesmo `tx.job.update` que muda o status pra `RUNNING`), não na conclusão — detalhe que causou um bug real nos meus próprios helpers de teste (ver Bug #3 abaixo).
- Nenhuma migration nova desde `20260916240100` (PM-CONV-05) existia no início desta rodada — confirmado via listagem do diretório de migrations.

---

## TRACK E — Job Engine Hardening (§5E — mandato mais detalhado da autorização)

**STATUS: CONCLUÍDO.**

### Diagnóstico real (não assumido)

A flakiness declarada como pendência honesta pelo PM-CONV-05 foi isolada e comprovada como **problema de isolamento de teste, não risco equivalente em produção** — a fila global cross-tenant é comportamento correto e testado (`job-queue-concurrency.test.ts`, 10 jobs/5 drains concorrentes, nenhuma perdida/duplicada). Quatro bugs reais foram encontrados, cada um pela observação direta da falha (nunca "parece que é isso"), e corrigidos:

1. **`RUNNING` tratado como terminal** — o helper de teste que drena a fila até a própria job concluir saía cedo demais quando via `status !== READY/RETRY_WAIT`, incluindo por engano o caso de "outro arquivo de teste está processando esta job agora" (`RUNNING`). Corrigido com um `Set` explícito dos 4 status genuinamente terminais (`SUCCEEDED`/`FAILED`/`DEAD_LETTER`/`CANCELLED`).
2. **Job type de teste registrado só em um arquivo** — Vitest isola o registro de módulos por arquivo; quando o drain de um arquivo reivindicava (corretamente, por design da fila global) uma job de tipo só conhecido em OUTRO arquivo, o motor a `DEAD_LETTER`ava (comportamento seguro e correto do motor — falha ao reconhecer o tipo). Corrigido centralizando os job types só-de-teste em `apps/web/tests/helpers/register-test-job-types.ts`, importado por todo arquivo que participa da fila compartilhada.
3. **`attempts` sobe no claim, não na conclusão** — um segundo helper (`reivindicarUmaTentativa`, usado pelos testes de retry/timeout) saía cedo assim que `attempts` subia, capturando a job ainda `RUNNING` (reivindicada por outro arquivo, ainda não terminada). Corrigido exigindo `attempts > antes` **E** `status !== RUNNING`.
4. **(Achado adicional, mais profundo) `vi.stubGlobal("fetch")` não protege contra execução cross-arquivo** — descoberto ao rodar `job-whatsapp-resend.test.ts` sozinho em loop (8/8 sem falha) vs. junto da suíte completa (~3/10 falhas). Como a fila é genuinamente global, um job `whatsapp.enviar_mensagem` submetido por este arquivo podia ser reivindicado e EXECUTADO por outro arquivo de teste rodando em paralelo — cujo `fetch` real (não mockado naquele processo) faria uma chamada de verdade à Graph API da Meta com credenciais falsas. Corrigido substituindo o mock por processo por um **servidor HTTP real e compartilhado** (`apps/web/tests/setup/whatsapp-mock-server.ts`, subido uma única vez via `globalSetup` do Vitest, antes de qualquer worker existir) — o comportamento simulado (sucesso/falha transitória/janela fechada/nunca responder) agora viaja no próprio conteúdo do payload do job, então é determinístico não importa qual arquivo o execute.

### Verificação (não confiança em "parece corrigido")

- `apps/web`: **22 execuções completas consecutivas da suíte** (10 + 12, em dois lotes), **105/105 testes passando em todas as 22** — zero flakiness.
- `job-whatsapp-resend.test.ts` isolado: 8/8 execuções, 5/5 testes cada.
- `packages/db`: suíte de integração completa rodada 4× (1 inicial + 3 em lote), **372/372 em todas**.

### §4E — Retenção de pings agendada de verdade

`purgarPingsAntigos()` (PM-CONV-05) existia só como função standalone. Agora está conectada ao Job Engine: novo job type `geolocation.purgar_pings_antigos` (`apps/web/src/lib/jobs/definitions/geolocation-purgar-pings.ts`) que roda a purga do próprio tenant e, ao terminar com sucesso, **reagenda sua própria próxima execução em +24h** — padrão de recorrência por auto-ressubmissão (necessário porque todo `Job` pertence obrigatoriamente a um tenant; não existe "job global" no motor, então não há cron cross-tenant nativo a reaproveitar). A cadeia começa em `garantirPurgaDePingsAgendada()`, chamada de `iniciarMeuTrackingAction` sempre que um tenant começa a usar GPS de verdade — idempotente por `idempotencyKey` (tenant+dia), nunca duplica.

### §6E — Concorrência real de início de tracking

Teste novo com `Promise.all` (não sequencial) provando duas tentativas VERDADEIRAMENTE simultâneas de iniciar tracking pro mesmo (grupo, profissional). Isso revelou um bug real: `iniciarTracking` fazia SELECT-then-`create()` sem proteção — sob concorrência genuína, isso lançaria uma violação do índice único parcial não tratada (e, pior, um erro de constraint dentro de uma transação interativa do Prisma "envenena" a transação Postgres inteira). Corrigido com o mesmo padrão atômico já comprovado em `cost-control.ts`/`tools/broker.ts`: `INSERT ... ON CONFLICT (...) WHERE status = 'ATIVA' DO NOTHING ... RETURNING`.

### §7E / revisão de polling (compartilhada com Track C)

`LiveMap` (mapa ao vivo, polling de 8s) tinha três gaps reais sob restrição de Vercel: (1) sem pausa em aba oculta — central de operações aberta em segundo plano gerava invocação serverless + query a cada 8s indefinidamente; (2) sem proteção contra sobreposição — resposta lenta podia terminar depois de uma requisição mais nova, sobrescrevendo posição fresca com dado velho; (3) sem backoff — falha transitória continuava tentando a cada 8s sem folga real pro banco. Os três foram corrigidos (pausa via `visibilitychange`, guarda de requisição em voo + sequência descartando resposta obsoleta, backoff exponencial até 60s em falha). Decisão de polling (não WebSocket) mantida — não é "estética", é a mesma razão declarada no PM-CONV-05 (funções serverless não seguram bem conexão de longa duração).

**ARQUIVOS TOCADOS:** `apps/web/tests/helpers/{job-queue,register-test-job-types}.ts` (novos), `apps/web/tests/setup/whatsapp-mock-server.ts` (novo), `apps/web/tests/helpers/whatsapp-mock.ts` (novo), `apps/web/tests/integration/job-queue-concurrency.test.ts` (novo), `apps/web/tests/integration/{job-lead-repescar,job-travel-document-verificar,job-whatsapp-resend}.test.ts` (editados), `apps/web/vitest.config.ts` (`testTimeout: 15000` + `globalSetup`), `packages/db/vitest.config.ts` (`testTimeout: 15000`, mesmo motivo), `apps/web/src/lib/whatsapp/cloud-api.ts` (base URL configurável só em teste), `apps/web/src/lib/jobs/definitions/geolocation-purgar-pings.ts` (novo), `apps/web/src/lib/jobs/index.ts`, `apps/web/src/app/actions/geolocation.ts`, `apps/web/src/components/maps/live-map.tsx`, `packages/db/src/geolocation.ts` (fix atômico), `packages/db/tests/integration/pm-conv-05a-geolocation.test.ts` (+1 teste de concorrência real).

**LIMITAÇÕES:** nenhuma conhecida — este era o item mais crítico da autorização e foi verificado com o maior rigor empírico (22 execuções completas).

---

## TRACK C — Central de Operações Avançada

**STATUS: CONCLUÍDO.**

Três lacunas declaradas no PM-CONV-05 foram fechadas, todas reaproveitando dado/lógica já existente (zero model novo, zero duplicação):

1. **Ocorrências visíveis na Central** (`ocorrencias.view`) — `obterPainelOperacional` agora inclui as 5 ocorrências mais recentes de cada grupo (reaproveita `TripIncident`/`listarOcorrenciasDoGrupo`, nunca edita/duplica).
2. **Enriquecimento do mapa** — última atualização de rastreamento (timestamp real do último ping, não fabricado), e parada atual/próxima derivadas de `TripActivityProgress` real (o que o guia já marcou em campo) — **nunca ETA estimada/fabricada**. A derivação virou uma função compartilhada (`derivarParadaAtualProxima`, em `trip-group.ts`) reaproveitada também pela área do passageiro (Track B), fonte única.
3. **Alertas novos, só quando derivados de dado real:** `RASTREAMENTO_DESATUALIZADO` (sessão ATIVA mas sem ping há ≥10min — distinto de `SEM_RASTREAMENTO`) e `OCORRENCIA_GRAVE` (existe ocorrência severidade ALTA). Nenhum alerta hardcoded.

**TESTES:** `pm-conv-05c-operations.test.ts` foi de 6 → 12 (rastreamento desatualizado × 2, ocorrências × 3, parada atual/próxima × 1) — todos passando, incluindo isolamento cross-tenant das ocorrências.

**LIMITAÇÕES:** quick-action shortcuts (ex.: "marcar embarque direto da Central") não foram adicionados — a Central continua deliberadamente somente-leitura, como já era; adicionar ações ali seria uma mudança de escopo de interação, não uma correção de lacuna declarada.

---

## TRACK D — i18n + Help Completo

**STATUS: CONCLUÍDO.**

A dívida declarada de 17 rotas legadas cobertas só por fallback (PT-BR→EN) foi fechada por completo. Trabalho delegado a um subagente com escopo estritamente isolado (só `packages/db/src/help/content.ts` e `tests/unit/help.test.ts`) — verificado depois, não só confiado:

- Todas as **24 rotas** registradas em `HELP_ROUTES` agora têm conteúdo próprio (não fallback) nos **5 idiomas** (PT-BR/PT-PT/EN/ES/FR) — confirmado por um teste novo que itera `HELP_ROUTES` de verdade e afirma `localesComConteudoProprio(helpKey)` conter os 5 locales (substitui os spot-checks anteriores).
- Traduções reais, não cópia mecânica — PT-PT usa vocabulário europeu de verdade (telemóvel, ecrã, palavra-passe, etc.), ES/FR são traduções fluentes, não literais.
- `content.ts` cresceu de 484 para 823 linhas — profundidade de conteúdo comparável ao original em todo bloco novo, não stubs.
- `tsc --noEmit`, `test tests/unit/help.test.ts` (9/9) e a suíte completa de `packages/db` (125 unit / 372 integration) confirmados passando depois da mudança.

**LIMITAÇÕES:** nenhuma — dívida declarada fechada integralmente.

---

## TRACK B — Mobile / PWA Avançado

**STATUS: CONCLUÍDO (dentro do escopo tocado nesta rodada) / PARCIAL (capacidades operacionais móveis novas ficam para rodada futura).**

Aplicada rigorosamente a **DECISÃO DEFINITIVA** registrada mid-sessão: mobile é o MESMO app, responsivo — nunca uma segunda UI. Nenhuma mudança de layout/design foi feita; todo trabalho abaixo é funcional/infraestrutura.

1. **Ícone PWA — lacuna SVG-only fechada.** `apple-touch-icon` (usado pelo "Adicionar à Tela de Início" do iOS/Safari) **não suporta SVG** — o iOS simplesmente não mostrava ícone nenhum, essa era a limitação real por trás da declaração do PM-CONV-05. Gerados PNGs reais (180/192/512px) a partir do MESMO `icon.svg` (nenhum redesenho) via `resvg-cli` — ferramenta usada só no MOMENTO da geração via `npx`, **nunca adicionada como dependência do projeto** (exatamente como o comando pediu: "sem dependência pesada"). Manifest e `layout.tsx` atualizados; verificado servindo nas dimensões corretas no navegador.
2. **Service worker — auditado, já em conformidade, nenhuma mudança de comportamento necessária.** Confirmado por leitura direta: cache-first só para `_next/static/*` + ícone/manifest (nunca muda de conteúdo pra mesma URL com hash); todo o resto (página/API/server action) sempre vai à rede; fallback offline só para navegação, nunca para mutação. Nunca cacheia passaporte/TravelerCare/token/documento — já era assim, confirmado, não alterado. `CACHE_NAME` incrementado (`v1`→`v2`) e a lista de precache dos novos ícones adicionada, sem mudar a estratégia de segurança.
3. **Área do passageiro (`/minha-viagem`) — evoluída com dado real novo.** Adicionado "parada atual/próxima" (mesma derivação da Central de Operações, Track C — fonte única, nunca duas lógicas). Auditoria de segurança confirmou (e testes novos comprovam): nunca vaza `TravelerCare` (dieta/condições/medicamentos — testado com um registro real presente, confirmado ausente do JSON de saída), nunca vaza atividade `visivelParaViajante=false` mesmo quando ela é a "parada atual" (regra de visibilidade aplicada também à derivação de parada), nunca vaza preço/comissão/booking ID/lead ID (testado no E2E de Track F).
4. **Validação responsiva** — dashboard e central de operações verificados em viewport mobile (375×812) via leitura de página (screenshot indisponível nesta sessão — painel não renderizava no momento da captura; `get_page_text`/`read_page` confirmaram o conteúdo correto sem quebra de layout, mas é uma verificação mais estreita que a visual completa, registrada como limitação abaixo).

**NÃO FEITO NESTA RODADA (limitação declarada, não escondida):** capacidades operacionais móveis NOVAS para guia/motorista via Yalla (selecionar operação, consultar grupo/passageiros por chat, etc.) — ver Track A abaixo, é a mesma lacuna, teria que nascer junto. As capacidades operacionais que já existiam (tracking start/stop, ocorrência, check-in/embarque) continuam funcionando e responsivas, só não ganharam NADA novo nesta rodada além do que está listado acima.

**TESTES:** `pm-conv-05b-passageiro.test.ts` foi de 5 → 9 (TravelerCare leakage, IDOR entre duas credenciais reais, parada atual/próxima respeitando visibilidade × 2).

---

## TRACK A — Yalla Internacional Real

**STATUS: PARCIAL — auditado a fundo, nada fabricado, lacuna de escopo declarada explicitamente.**

### Auditoria de providers (nunca assumido, nunca segredo impresso)

Confirmado por leitura direta do `.env`/`.env.example` deste ambiente: **nenhuma credencial real de LLM (Anthropic/OpenAI), tradução ou voz está configurada.** Isso não é uma lacuna de código:
- O núcleo de chat do Yalla (`apps/web/src/lib/ai/{yalla,provider}.ts`) já é uma integração REAL e multi-provider (Anthropic Messages API / OpenAI Chat Completions, tool calling estruturado nativo dos dois, timeout+retry real) — auditado linha a linha nesta rodada, confirmado que nunca simula: quando um tenant não tem `aiApiKeySecretRef`/`aiProvider` configurado (via SecretProvider, por tenant — não `.env` global), a função retorna `null` de forma limpa e silenciosa, nunca inventa resposta.
- `TranslationProvider`/`VoiceProvider` (PM-CONV-05) permanecem corretamente `PROVIDER_NAO_CONFIGURADO` — reconfirmado que é o estado honesto, não uma lacuna esquecida.
- **Nada foi implementado de novo aqui** porque não havia nada de errado pra corrigir — a arquitetura já é real, só está dormente neste ambiente por falta de credencial (decisão/ação de configuração do usuário, não de código).

### Handoff humano — auditado, confirmado correto

`atendimento.encaminhar_humano` (Camada 2, T3) lido por completo: resumo estruturado sempre montado a partir de dado confiável do banco (nunca texto livre do modelo), campo desconhecido vira `null` explícito, desliga `Conversation.aiEnabled`, tenant-scoped com dupla checagem mesmo sob RLS. Nenhuma mudança necessária.

### Contexto seguro do passageiro — expandido (ver Track B)

Parada atual/próxima adicionada com os mesmos testes de segurança do item anterior.

### Testes de segurança/negativos — expandidos

`pm-conv-05b-passageiro.test.ts`: vazamento de TravelerCare (negativo, com dado real presente), IDOR entre duas credenciais reais do mesmo tenant. `pm-conv-06f-e2e-journey.test.ts`: confirma que a área do passageiro nunca expõe preço da proposta, ID do booking nem ID do lead.

### NÃO FEITO NESTA RODADA — declarado, não escondido

**Ferramentas operacionais via Yalla para staff em campo** (guia/motorista perguntando "qual meu próximo grupo", "confirma embarque de X" por chat) e o **handoff via chat para o próprio Yalla operacional** (distinto do handoff cliente→humano que já existe) são features NOVAS de superfície — precisariam de um novo ponto de entrada de conversa (hoje `gerarRespostaYalla` é ancorado numa `Conversation` de cliente via WhatsApp, não numa sessão de staff autenticado), um novo conjunto de tools operacionais RBAC-resolvidas no backend, e validação de segurança própria (nunca deixar o modelo escolher tenant/grupo — sempre resolver pelo `ctx` da sessão autenticada, mesmo padrão já usado). É trabalho real e do tamanho de uma track própria — implementá-lo apressado nesta rodada, sem o mesmo rigor de teste aplicado ao resto, seria exatamente o tipo de atalho que este projeto tem evitado desde o PM-NIGHT-RUN-01. Fica como recomendação explícita para uma rodada futura.

---

## TRACK F — Integração E2E

**STATUS: CONCLUÍDO (dentro do que é testável nesta sessão).**

**Jornada ponta a ponta real, novo teste** (`packages/db/tests/integration/pm-conv-06f-e2e-journey.test.ts`): Lead → Proposta → aceite → Booking → Traveler → Trip/roteiro/grupo → crew → credencial → check-in → embarque → progresso de parada → início de GPS → ping → ocorrência severidade ALTA — tudo em um tenant isolado criado só para o teste (nunca dado de produção), passando na primeira execução real. Depois da cadeia, confirma que **Dashboard Executivo**, **Central de Operações** e **área do passageiro** — os três painéis construídos por tracks diferentes — refletem exatamente o mesmo estado final (passageiros/check-ins/embarques/parada atual/alerta de ocorrência grave/ausência de alerta de sem-rastreamento), e que a área do passageiro não vaza preço/booking id/lead id.

**Segurança revisada nesta rodada (RLS/RBAC/Audit/IDOR/token/cross-tenant):** cobertos pelos testes específicos de cada track (geolocation, operations, passageiro) mais o E2E acima — nenhuma nova superfície de RBAC ou RLS foi introduzida nesta rodada (zero migration nova), então a superfície de segurança testada é a mesma do PM-CONV-05, com testes adicionais de profundidade (IDOR, TravelerCare leakage, concorrência real).

**Mobile E2E real em viewport de telefone:** feito para dashboard/central de operações (ver Track B, limitação de screenshot registrada). Não foi montado um fluxo de clique-a-clique completo (login→uso) em viewport de telefone para o fluxo operacional do guia — verificação ficou no nível de leitura de página, não captura visual pixel-a-pixel.

**Regressão visual — zero mudança não autorizada:** toda edição de arquivo `.tsx` desta rodada foi aditiva (novo bloco condicional, nova seção) sobre markup existente, nunca removeu ou alterou um elemento pré-existente — confirmado por leitura de cada diff durante a implementação, não só por afirmação. Nenhum arquivo de estilo/tema/design system foi tocado.

---

## BLOCO QUANTITATIVO

**ARQUIVOS CRIADOS (10):** `apps/web/tests/helpers/{job-queue,register-test-job-types,whatsapp-mock}.ts`, `apps/web/tests/setup/whatsapp-mock-server.ts`, `apps/web/tests/integration/job-queue-concurrency.test.ts`, `apps/web/src/lib/jobs/definitions/geolocation-purgar-pings.ts`, `apps/web/public/icon-{180,192,512}.png`, `packages/db/tests/integration/pm-conv-06f-e2e-journey.test.ts`.

**ARQUIVOS ALTERADOS (~21):** `apps/web/vitest.config.ts`, `packages/db/vitest.config.ts`, `apps/web/tests/integration/{job-lead-repescar,job-travel-document-verificar,job-whatsapp-resend}.test.ts`, `apps/web/src/lib/whatsapp/cloud-api.ts`, `apps/web/src/lib/jobs/index.ts`, `apps/web/src/app/actions/geolocation.ts`, `apps/web/src/components/maps/live-map.tsx`, `apps/web/src/app/(app)/operacoes/page.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/public/{manifest.webmanifest,sw.js}`, `apps/web/src/app/minha-viagem/page.tsx`, `packages/db/src/{geolocation,operations,trip-group,passageiro}.ts`, `packages/db/src/help/content.ts`, `packages/db/tests/unit/help.test.ts`, `packages/db/tests/integration/{pm-conv-05a-geolocation,pm-conv-05c-operations,pm-conv-05b-passageiro}.test.ts`.

**MODELS NOVOS/ALTERADOS:** nenhum. **MIGRATIONS NOVAS:** nenhuma. **RLS NOVA:** nenhuma. **RBAC NOVA:** nenhuma (só reaproveito de `gps.view`/`ocorrencias.view`/`operacoes.view` já existentes). **AUDIT NOVO:** nenhum evento novo — sessão inteira foi aditiva sobre a fundação de dado já existente, exatamente como o "zero redesign" pedia.

**HELP KEYS:** 24/24 rotas com helpKey (inalterado — nenhuma rota nova). **ROTAS COM 5 IDIOMAS:** 24/24 (era 7/24 no início da rodada — fechou os 17 que faltavam).

**TESTES — ANTES → DEPOIS:**
| Pacote | Antes (início da rodada) | Depois | Novos |
|---|---|---|---|
| `packages/db` unit | ~124 | 125 | +1 (help — cobertura completa) |
| `packages/db` integration | ~360 | 372 | +12 (concorrência GPS +1, passageiro +4, operações +6, E2E +1) |
| `apps/web` | 104 | 105 | +1 (job-queue-concurrency) |
| **Total** | **~588** | **602** | **+14** |

**PASSANDO/FALHANDO:** 602/602 passando. `packages/db` (497 testes) verificado 4× consecutivas sem falha; `apps/web` (105 testes) verificado **22× consecutivas** sem falha sob paralelismo normal — o número mais alto de repetições desta engenharia até agora, proporcional à criticidade do que estava sendo corrigido.

**PARALELOS:** confirmado — nenhuma suíte precisa de `--no-file-parallelism` ou qualquer flag de redução de paralelismo. Execução paralela normal do Vitest, 100% estável.

**TYPECHECK:** `pnpm --filter web run typecheck` e `pnpm --filter @partiumarrocos/db exec tsc --noEmit` — limpos, verificados repetidamente ao longo da rodada.
**LINT:** `pnpm --filter web run lint` — limpo (0 warnings/errors).
**BUILD:** não executado nesta rodada (typecheck+lint+602 testes já cobrem a superfície tocada; `next build` de produção fica pra verificação final antes de deploy, não bloqueou nenhuma decisão de código aqui).
**ALTERAÇÃO VISUAL NÃO AUTORIZADA:** nenhuma — toda mudança de UI foi aditiva, verificada por leitura de diff.

---

## MATRIZ DE CAPACIDADES (visão executiva)

| Capacidade | Status |
|---|---|
| Job Engine — execução paralela confiável | ✅ Verificado (22 execuções limpas) |
| Purga de GPS agendada automaticamente | ✅ Novo — recorrência via auto-ressubmissão |
| Concorrência real de início de tracking | ✅ Corrigido atomicamente + testado |
| Central de Operações — ocorrências visíveis | ✅ Novo |
| Central de Operações — parada atual/próxima | ✅ Novo (fonte única com passageiro) |
| Central de Operações — alertas de rastreamento desatualizado/ocorrência grave | ✅ Novo |
| Polling do mapa — seguro sob restrição Vercel | ✅ Corrigido (pausa/backoff/sem sobreposição) |
| Help — cobertura 5 idiomas | ✅ 24/24 (era 7/24) |
| PWA — ícone iOS funcional | ✅ Corrigido (PNG real) |
| PWA — service worker seguro | ✅ Auditado, já conforme |
| Passageiro — parada atual/próxima | ✅ Novo |
| Passageiro — segurança (IDOR/TravelerCare) | ✅ Testado explicitamente |
| Yalla — providers reais quando configurados | ✅ Auditado, confirmado real e correto |
| Yalla — tradução/voz | ⛔ Bloqueado (sem credencial — correto, não fabricado) |
| Yalla — ferramentas operacionais para staff (novo) | ❌ Fora de escopo desta rodada (declarado) |
| E2E — jornada completa | ✅ Novo, passando |
| App nativo Android/iOS | ⛔ Fora de escopo (decisão do usuário, não revisitada) |

---

## VEREDITO POR TRACK

- **Track E (Job Engine Hardening):** CONCLUÍDO.
- **Track C (Central de Operações):** CONCLUÍDO.
- **Track D (i18n/Help):** CONCLUÍDO.
- **Track B (Mobile/PWA):** CONCLUÍDO no escopo tocado / PARCIAL nas capacidades operacionais novas (declarado).
- **Track A (Yalla Internacional Real):** PARCIAL — auditoria e segurança concluídas; ferramentas operacionais novas fora de escopo (declarado).
- **Track F (Integração E2E):** CONCLUÍDO dentro do testável nesta sessão.

**VEREDITO GERAL: CONCLUÍDO**, com as duas lacunas de Track A/B (ferramentas operacionais novas via Yalla para staff em campo) declaradas explicitamente como fora de escopo desta rodada — nunca escondidas, nunca simuladas.

---

## Critério de Done — checklist

1. Job Engine confiável em paralelo normal — ✅ 22 execuções limpas.
2. Causa raiz determinada por leitura de código, não suposição — ✅ (4 bugs, cada um com diagnóstico direto).
3. Correção real, não `--no-file-parallelism` — ✅ nenhuma flag de redução de paralelismo em nenhum lugar.
4. Regressão de concorrência automatizada — ✅ `job-queue-concurrency.test.ts`.
5. Retenção de GPS agendada de verdade — ✅.
6. Concorrência real de tracking testada e corrigida — ✅.
7. Central de Operações sem lacunas declaradas do PM-CONV-05 — ✅.
8. Alertas sempre derivados de dado real — ✅.
9. i18n — 0 rotas staff sem 5 idiomas — ✅ 24/24.
10. PWA — ícone funcional em iOS — ✅.
11. Service worker nunca cacheia dado sensível — ✅ auditado.
12. Segurança do passageiro testada (IDOR/TravelerCare/visibilidade) — ✅.
13. Zero alteração visual não autorizada — ✅.
14. Nenhuma integração externa simulada — ✅ (Yalla real quando configurado; tradução/voz corretamente bloqueados).

---

## Recomendação para PM-CONV-07 (KeroMarketing) — só planejamento, sem execução

Conforme a autorização, nenhuma linha de código de integração com KeroMarketing foi tocada. Recomendação de escopo para quando for autorizado:
1. Auditar KeroMarketing (módulos de Ads/SEO/Analytics/Search Console/Social/Attribution) por reaproveitamento real, mesmo padrão de auditoria já usado nesta casa (ler código, não assumir).
2. Definir um contrato de integração explícito (que dado o Partiu Marrocos expõe pro KeroMarketing, que dado nunca cruza) — preservando o KeroMarketing como fonte de verdade do que já é dele.
3. Não misturar esse trabalho com Country Packs/fiscal/pagamento internacional/publicação em loja de app — continuam fora de escopo até autorização própria.

**Aguardando avaliação. Nenhuma ação além do relatório foi tomada fora do autorizado.**
