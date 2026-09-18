# Yalla Knowledge Base 01 — Relatório de Fechamento

**Fase 1 de N — pedido do usuário ("Base Mestre de Conhecimento do Viajante v1.0"), escopada em conjunto com ele via pergunta direta.**

## Objetivo

O usuário trouxe uma especificação de 43 seções pedindo uma base de conhecimento completa
para a Yalla: mínimo de 1.000 formulações de pergunta reais, 300-500 intenções, 100
categorias, 5 idiomas, com regra anti-alucinação rígida e quatro tipos de resposta
(STATIC_KNOWLEDGE, OFFICIAL_DYNAMIC, TRIP_DYNAMIC, REALTIME_CONTEXT).

Investigação confirmou que nada disso existia — mas a arquitetura de Tool Broker já madura
da Yalla (`packages/db/src/tools/`) era exatamente o encaixe certo. Escopo desta fase,
alinhado com o usuário: arquitetura completa + lote inicial real (não fabricado), com o
volume completo de 1.000+ formulações explicitamente adiado para rodadas futuras de
conteúdo, sem mudança de arquitetura necessária.

## Decisões de arquitetura

### Idioma: conteúdo canônico só em pt-BR
A Yalla já responde nativamente em qualquer idioma pra todo o resto dos dados que manipula
(trip, lead, etc.) — sem camada de tradução separada, o próprio modelo detecta e espelha o
idioma do cliente. A base de conhecimento segue o mesmo precedente: `respostaBase` é escrita
uma vez em pt-BR, a Yalla adapta/traduz na hora de responder. Evita multiplicar por 5 o
esforço de autoria por entrada, e mantém consistência com o resto do agente.

### Roteamento: resposta fixa vs. tool dinâmica, nunca as duas coisas
`KnowledgeEntry.answerType` STATIC_KNOWLEDGE/OFFICIAL_DYNAMIC carregam `respostaBase`
pronta. TRIP_DYNAMIC/REALTIME_CONTEXT **nunca** guardam resposta fixa — só apontam
(`toolId`) qual tool real a Yalla deve chamar em seguida. A tool `conhecimento.consultar`
nunca tenta responder um dado dinâmico sozinha; isso é o que evita ela virar uma segunda
fonte de invenção paralela às tools já existentes.

### Duas lacunas reais de dados, preenchidas nesta fase
- **"Próxima atividade por horário real"**: a função existente (`derivarParadaAtualProxima`,
  `packages/db/src/trip-group.ts`) é baseada em status marcado pelo guia, não em relógio —
  não respondia "que horas saímos amanhã" de verdade. Nova tool
  `viagem.proxima_atividade` + novo helper `combinarDataHoraNoTimezone` (mesmo arquivo,
  junto de `derivarParadaAtualProxima` — fonte única) resolvem isso combinando
  `TripItineraryDay.data` + `TripActivity.horaInicio` no timezone IANA da própria Trip, via
  `Intl.DateTimeFormat` nativo (sem dependência nova — `packages/db` não tinha
  date-fns-tz/luxon).
- **GPS "desatualizado"**: não existia limiar de staleness em lugar nenhum do projeto —
  `obterPosicoesAtivasDoGrupo` sempre devolvia a posição mais recente, sem checar idade.
  Nova tool `viagem.localizacao_veiculo` aplica um limiar de 10 minutos; posição mais velha
  vira `POSICAO_DESATUALIZADA`, nunca é apresentada como atual.

### Hotel/refeição — deliberadamente fora de escopo
Não existe campo estruturado de hotel/refeição incluída (só texto livre em
`TripActivity`). Decisão do usuário: sem migration nova nesta fase — a Yalla admite que não
tem esse dado e escala, seguindo a própria regra anti-alucinação já existente no prompt.

## Modelo de dados

Migrations: `20260918054604_yalla_knowledge_base_01` (tabela `knowledge_entries` + enums
`KnowledgeAnswerType`/`KnowledgeRiskLevel`) e `20260918054700_enable_rls_yalla_knowledge_base_01`
(RLS, mesmo padrão `tenant_isolation` de toda tabela tenant-scoped do projeto).

`KnowledgeEntry`: `categoria`/`subcategoria`/`intencao`, `answerType`, `riskLevel`,
`pergunta` + `variantes[]`/`keywords[]`/`tags[]` (arrays Postgres simples — na escala de
dezenas de entradas, buscar tudo e pontuar em memória no handler é suficiente; infra de
busca full-text fica para se/quando o volume crescer para centenas), `respostaBase`,
`fonte`/`fonteTipo`/`ultimaVerificacao`/`intervaloRevisaoDias` (obrigatório de fato em
OFFICIAL_DYNAMIC — disciplina no script de seed, não um CHECK constraint: não há UI de
autoria ainda), `requerTool`/`toolId` (roteamento), `politicaEscalonamento`/`fallback`.

## Tools novas (Tool Broker, Camada 1 — READ_ONLY)

- **`conhecimento.consultar`** (`packages/db/src/tools/definitions/conhecimento.ts`) —
  único input não-vazio (`{ pergunta: string }`, mesmo precedente de
  `atendimento.encaminhar_humano`). Busca as entradas ativas do tenant, pontua por
  sobreposição de keywords/tokens (sem embeddings), devolve a melhor. Calcula
  `desatualizado` a partir de `ultimaVerificacao` + `intervaloRevisaoDias`.
- **`viagem.proxima_atividade`** — próxima atividade cujo horário real ainda não passou,
  no timezone da Trip, respeitando `visivelParaViajante`.
- **`viagem.localizacao_veiculo`** — última posição de GPS do veículo/grupo do lead, só se
  recente (< 10 min); resolução de `tripGroupId` sempre via `ctx.leadId → Booking`, nunca
  de input do modelo (mesmo padrão IDOR-safe de `viagem.consultar_contexto`).

Confirmado no código: `CAPABILITIES_PADRAO_YALLA` deriva automaticamente de
`CAMADA_1_TOOLS`, e `seed.ts` chama `provisionarGrantsPadrao` com essa lista — mas isso só
afeta tenants semeados a partir de agora. Para o tenant Partiu Marrocos já existente, foi
necessário reprovisionar os grants explicitamente (`pnpm --filter @partiumarrocos/db run
seed`, idempotente) tanto local quanto em produção.

## Integração com Yalla

Um parágrafo adicionado ao `SYSTEM_PROMPT` existente (`apps/web/src/lib/ai/yalla.ts`), sem
reescrever nada: instrui a chamar `conhecimento.consultar` antes de responder perguntas
gerais sobre documentação/dinheiro/cultura/roteiro/logística; se `requerTool: true`, chamar
a tool indicada em `toolIdSugerido`; se `desatualizado`/`riskLevel: ALTO`, hedging e oferta
de confirmar com a equipe; se `encontrado: false`, regra de sempre (nunca inventar).

De passagem, corrigido um bug real achado no primeiro teste ponta a ponta com OpenAI: os
`id` das tools do Tool Broker usam "." (ex. `lead.atualizar_preferencias`), que a API de
function-calling da OpenAI rejeita — `sanitizarNomeTool` (dots→underscores) + mapa reverso
resolvem isso na declaração enviada ao provider, sem mudar nenhum `id` real de tool.

## Conteúdo inicial (19 entradas reais)

| Categoria | answerType | Fonte |
|---|---|---|
| Visto brasileiro | OFFICIAL_DYNAMIC | [gov.br/MRE, Embaixada Rabat](https://www.gov.br/mre/pt-br/embaixada-rabat/rabat-arquivos/informacoes-uteis) |
| Validade do passaporte | OFFICIAL_DYNAMIC | mesma fonte acima |
| Vacina obrigatória | OFFICIAL_DYNAMIC | mesma fonte acima |
| Moeda / câmbio / cartão / gorjetas (4) | STATIC_KNOWLEDGE | conhecimento geral, baixo risco |
| Vestimenta / saudações / fotografia (3) | STATIC_KNOWLEDGE | conhecimento geral |
| Ramadã | OFFICIAL_DYNAMIC | data lunar, revisão anual |
| Próximo horário / itinerário / status da reserva (3) | TRIP_DYNAMIC | aponta pra tool real, sem resposta fixa |
| Onde está o ônibus | REALTIME_CONTEXT | aponta pra `viagem.localizacao_veiculo` |
| Como funciona o rastreamento | STATIC_KNOWLEDGE | explica a funcionalidade, não é dado ao vivo |
| Contato de emergência da agência | STATIC_KNOWLEDGE | sempre escala pra equipe confirmar |
| Emergência médica | OFFICIAL_DYNAMIC | [morocco-guide.com, números oficiais](https://www.morocco-guide.com/information/useful-and-emergency-phone-numbers-for-traveler/) |
| Passaporte perdido | OFFICIAL_DYNAMIC | [gov.br/MRE, Embaixada Rabat](https://www.gov.br/mre/pt-br/embaixada-rabat) |

Todas as entradas OFFICIAL_DYNAMIC foram pesquisadas via WebSearch em 2026-09-18 contra
fonte oficial real (nunca de memória) — categoria de maior risco de alucinação apontada
pelo usuário. Script: `packages/db/src/seed-knowledge-partiu-marrocos.ts` (separado de
`seed.ts`, que é genérico pra qualquer tenant novo — conteúdo de KB é de negócio específico
da Partiu Marrocos).

## Anti-alucinação e escalonamento

Reforça o que já existia no prompt da Yalla (nunca inventar dado, escalar quando
apropriado), com três reforços específicos da base: (1) `respostaBase` nulo em entrada
dinâmica nunca é preenchido pelo modelo, só pela tool real; (2) `desatualizado`/`riskLevel`
altos disparam hedging explícito, principalmente em documentação/visto; (3)
`encontrado: false` cai na mesma regra de sempre — nunca inventar, oferecer escalar.

## Privacidade / IDOR

Nenhuma lógica de privacidade nova — as três tools reaproveitam a garantia estrutural já
existente do Tool Broker (`ctx.leadId`/`ctx.tenantId` sempre do contexto confiável, nunca do
input do modelo). Testado explicitamente (ver Testes abaixo) que isso vale igual pras tools
novas.

## Testes

`packages/db/tests/integration/yalla-knowledge-base.test.ts`, 13 casos: match estático,
roteamento dinâmico sem resposta fixa, sem-match honesto, isolamento entre tenants na busca
de conhecimento, próxima atividade por horário real (com atividade oculta/passada
corretamente ignorada), GPS com posição fresca/desatualizada/sem sessão/sem reserva, input
com campos arbitrários sem efeito, e tools sem grant devolvendo FORBIDDEN. Suíte completa
(31 arquivos, 408 testes) permanece verde.

## Verificação manual (local)

Testado ao vivo via webchat local (mesmo canal usado por WhatsApp e site):
- "Preciso de visto para entrar no Marrocos sendo brasileiro?" → resposta correta, com
  fonte citada.
- "Que horas saímos amanhã?" sem reserva vinculada → resposta honesta ("não há uma próxima
  atividade agendada"), nunca inventou horário.
- Confirmado via `tool_calls` que `conhecimento.consultar` e `viagem.proxima_atividade`
  foram de fato invocadas (`status: COMPLETED`) — não é o modelo respondendo de texto solto.

## Decisões em aberto / próximos passos

- **Volume completo** (1.000+ formulações / 300-500 intenções / 100 categorias) — arquitetura
  pronta pra crescer; conteúdo cresce em rodadas futuras de pesquisa/autoria.
- **Hotel/refeição estruturados** — precisa de migration em Trip/TripActivity/Booking quando
  priorizado.
- **UI de autoria** de `KnowledgeEntry` — hoje só via script/seed.
- **Testes de red-team completos** (100+ casos da especificação original) — o bloco de
  IDOR desta fase cobre o essencial estrutural, não a lista completa.
- **Limiar de match** (`conhecimento.consultar`) e **limiar de GPS desatualizado** (10 min)
  são constantes simples, ajustáveis conforme uso real.
