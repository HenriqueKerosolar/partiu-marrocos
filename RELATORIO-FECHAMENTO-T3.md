# T3 — Tool Broker Mínimo + Yalla Camadas 1 e 2 — Relatório de Fechamento

Escopo autorizado: **T3 — Tool Broker mínimo** (Tool Registry, Tool Definition, input/output schema, Tool Risk, Tool Authorization, Tool Execution, Tool Audit, timeout, idempotência) **+ Yalla Camadas 1 e 2**. Nenhuma Camada 3, nenhuma ação financeira/comercial crítica/irreversível, nenhum T4 Model Router, nenhum T5 Job Engine, nenhum F2-F6, `git init`/`push` não executados.

---

## 1. Resumo executivo

T3 implementado dentro do escopo exato autorizado, sobre a fundação já validada (T1 Gates/Audit, PM-BLOQ-001 SecretProvider, T2 Cost Control). Yalla deixou de ser só um gerador de texto: agora consulta e age sobre o CRM via tool/function calling estruturado real (nunca parsing de texto livre), sempre através de um Tool Broker com default-deny explícito — nenhuma tool roda só porque existe, nenhum agente recebe grant coringa. Tenant e identidade do lead/contato vêm sempre do contexto confiável da conversa, nunca de campo produzido pelo modelo (testado com tentativa real de injeção). SAFE_WRITE é idempotente de verdade (`ToolCall` com `UNIQUE(tenantId, toolCallId)`, fechando uma lacuna real que a pesquisa confirmou existir no Tool Broker do Ai DEV Orquestrador). Cada chamada de modelo dentro do loop de tool calling passa pelo Cost Control de T2 — nunca só a primeira. Limite de 4 iterações por mensagem evita loop/custo infinito. Gate intermediário entre Camada 1 e Camada 2 rodou e passou antes de qualquer wiring de Camada 2 em produção. 40 testes novos, todos passando; regressão completa (293 testes) sem quebra; typecheck e build limpos.

## 2. O que foi reaproveitado do Ai DEV

Pesquisa dedicada (agente read-only, evidência de código com arquivo/linha) extraiu o Tool Broker do Ai DEV Orquestrador. **Adaptado**: contrato `ToolDefinition` com Zod, risk levels (mesmo vocabulário de 5 níveis), registry central com default-deny, timeout via `Promise.race`, aviso de "isto é dado, não instrução" em todo tool result devolvido ao modelo. **Deliberadamente não portado** (com justificativa): `project_id` (→ `tenantId` real sob RLS), SQLite, as 11 tools de filesystem/Git/comando (zero aplicabilidade a CRM — só o padrão arquitetural foi reaproveitado), e — achado mais importante da pesquisa — a **ausência de idempotência real** para tools de escrita no Ai DEV (confirmada como uma lacuna genuína, não um padrão a copiar): `ToolCall` com `UNIQUE(tenantId, toolCallId)` foi construído do zero pra fechar exatamente essa lacuna. Detalhamento completo com justificativa de cada desvio: seção "T3" do `README.md`.

## 3. Arquitetura Tool Broker

`packages/db/src/tools/`: `types.ts` (contrato), `registry.ts` (registro central, default-deny), `grants.ts` (`AgentGrant`), `broker.ts` (`executarTool` — o único caminho de execução), `jsonSchema.ts` (Zod → JSON Schema), `definitions/*.ts` (tools reais). Ordem de decisão do Broker: tool existe? → idempotência (reserva/replay atômico) → grant ativo? → input válido? → executa com timeout → output válido? Cada etapa relevante audita no Audit Log de T1.

## 4. ToolDefinition

`id`/`nome`/`descricao`/`capability`/`risk`/`inputSchema`/`outputSchema` (Zod) /`sideEffects`/`requiresGate`/`timeoutMs`/`idempotent`/`handler(prisma, ctx, input)`. `capability` = `id` (1 tool = 1 capability, sem agrupamento grosseiro — "Yalla recebe só as capabilities necessárias"). `requiresGate` existe em todas as tools desta rodada como `false` — arquitetura pronta pra encaminhar uma tool de risco pra o Gate de T1 no futuro (T3 §21), sem reforma, mas nenhuma tool de Camada 3 foi criada só pra demonstrar isso.

## 5. Tool Registry

`Map<string, ToolDefinition>` em memória, populado uma vez por processo (cache de módulos do Node). `obterTool(id)` devolve `undefined` pra qualquer id não registrado; o Broker trata isso como `NOT_FOUND` (nome inventado pelo modelo nunca chega perto de um handler — testado).

## 6. Risk model

Enum `ToolRisk { READ_ONLY, SAFE_WRITE, PRIVILEGED_WRITE, EXTERNAL_SIDE_EFFECT, FINANCIAL }` — vocabulário completo já existe (compatibilidade com o desenho auditado do Ai DEV), mas só `READ_ONLY`/`SAFE_WRITE` têm tools reais nesta rodada. Os 3 níveis restantes ficam reservados pra uma Camada 3 explicitamente fora desta autorização.

## 7. Agent grants/policies

`AgentGrant` (tenant-scoped, RLS): `(tenantId, agent, capability)` único, `ativo` boolean. `concederCapability`/`revogarCapability`/`possuiGrant`/`listarGrants`/`provisionarGrantsPadrao` em `packages/db/src/tools/grants.ts`. Nenhum grant coringa (`"*"`/admin/all) existe ou é possível de representar no schema. Separado do RBAC humano (T3 §32) — testado: Administrador com `leads.manage` não dá nada ao Yalla; grant de um tenant nunca autoriza outro. `seed.ts` provisiona o conjunto padrão (Camada 1 + 2) pro tenant demo via `provisionarGrantsPadrao` — mesma função disponível pra qualquer tenant existente (mesmo espírito do procedimento operacional de PM-BLOQ-001).

## 8. Tools Camada 1

`lead.consultar`, `contato.consultar`, `conversa.consultar_historico` (`READ_ONLY`); `nota.registrar`, `tarefa.criar`, `contato.atualizar_dados_informados`, `lead.atualizar_preferencias` (`SAFE_WRITE`). Nenhuma aceita id de entidade do modelo (sempre contexto da conversa — IDOR eliminado por construção). `nota.registrar` cobre interesse/intenção/preferência/pendência via campo `categoria` (não 9 handlers). Allowlist Zod explícita em toda tool de escrita — nunca mass assignment do objeto Contact/Lead inteiro. `Lead.preferenciasCliente` (`Json?`, migration aditiva) guarda os dados de viagem estruturados e validados.

## 9. Resultado do Gate intermediário

Rodado e verificado nesta sessão, antes de qualquer wiring de Camada 2 em produção (loop de tool calling do Yalla, que ativa as tools de Camada 2 de verdade): todos os testes de Camada 1/broker (23 + 7) + regressão completa (unit + integration, todos os pacotes) + typecheck — **100% verde**. **T3-A: CONCLUÍDO.**

## 10. Tools Camada 2

`lead.mover_stage`, `lead.classificar`, `atendimento.encaminhar_humano`. "Agendar retorno"/"solicitar informação faltante" reaproveitam `tarefa.criar`/`nota.registrar` (não duplicam handler). `lead.mover_stage`: nunca aceita id de etapa do modelo — avança exatamente uma posição em `Stage.ordem` no mesmo pipeline, nunca para `isWon`/`isLost` (campos já existentes no schema, nenhuma tabela de "regras de transição" nova) — funciona pra qualquer nome de pipeline de qualquer tenant, nunca alcança GANHO/PAGO/CANCELADO/PERDIDO. Move etapa + Note numa única transação. `lead.classificar`: inferência do Yalla vira Note `[Inferência do Yalla]`, nunca sobrescreve dado cadastral (fato vs. inferência distintos, T3 §15). `atendimento.encaminhar_humano`: desliga `Conversation.aiEnabled` (campo já existente), monta resumo estruturado a partir de dado confiável do banco — campo desconhecido vira `null` explícito, nunca inventado.

## 11. Structured tool calling Anthropic/OpenAI

`apps/web/src/lib/ai/provider.ts` — abstração própria (`ToolDeclaracao`/`ModelToolCall`), nunca o formato nativo de um provider só. Nunca parseia texto livre (sem "responda JSON no final", sem regex). Traduz internamente pra `tools`/`tool_use` (Anthropic) e `tools`/`tool_calls` (OpenAI), a partir da documentação pública estável das duas APIs — nenhuma chamada real feita nesta rodada "pra descobrir". Argumentos malformados do modelo viram `{}`, nunca lançam — quem valida de verdade é o Zod do Tool Broker.

## 12. Loop control

`MAX_TOOL_ITERATIONS = 4` em `yalla.ts` (T3 §23 pediu "3-5 ciclos"). Ao atingir o limite: para de executar, audita (`YALLA_LOOP_LIMITE_ATINGIDO`), fallback silencioso (conversa continua manual) — nunca inventa resposta. Testado com um modelo que tenta chamar tool indefinidamente: para em exatamente 4 chamadas, nunca mais.

## 13. Timeout

`Promise.race` por tool (`timeoutMs` declarado em cada `ToolDefinition`, 5-8s nesta rodada). Testado com uma tool sintética que demora 500ms contra um timeout de 50ms: o Broker devolve `TIMEOUT` bem antes dos 500ms reais. Limitação documentada honestamente (mesma do Ai DEV): não cancela o trabalho subjacente da Promise original, só para de esperar por ele — risco prático baixo aqui porque as tools desta rodada são consultas/escritas simples de banco, sem chamada de rede externa.

## 14. Idempotência

`ToolCall` (`@@unique([tenantId, toolCallId])`, `INSERT...ON CONFLICT DO NOTHING...RETURNING`) — mesmo padrão atômico já usado em T2. Testado: mesmo `toolCallId` duas vezes → side effect uma única vez, segunda chamada devolve o mesmo resultado; `toolCallId` de uma tentativa negada não pode ser "reaproveitado" depois de conceder o grant (precisa de um `toolCallId` novo); `toolCallId` diferente sempre executa de novo (dedup é por `toolCallId`, nunca por conteúdo).

## 15. Transações

`lead.mover_stage`: mudança de `Lead.stageId`/`status` + `Note` numa única transação `withTenant` (mesmo padrão da versão humana desta ação, já existente). Reserva de idempotência (`ToolCall`) é sua própria transação atômica (upsert de uma instrução só, mesmo padrão de `CostUsage` em T2).

## 16. Audit

Reaproveita o Audit Log de T1: `TOOL_REQUESTED`/`TOOL_ALLOWED`/`TOOL_DENIED`/`TOOL_STARTED`/`TOOL_COMPLETED`/`TOOL_FAILED`/`TOOL_TIMEOUT`, mais `AGENT_GRANT_CONCEDIDO`/`AGENT_GRANT_REVOGADO`, `LEAD_STAGE_AVANCADO`, `TASK_CRIADA_POR_AGENTE`, `ATENDIMENTO_ENCAMINHADO_HUMANO`, `YALLA_LOOP_LIMITE_ATINGIDO`. Nunca o payload bruto de entrada/saída de uma tool — testado explicitamente (conteúdo de uma Note não aparece em nenhum evento de audit da execução que a criou).

## 17. Integração Cost Control

Cada chamada de modelo dentro do loop de tool calling passa por PRE-CHECK (T2) antes e `registrarCostEvent` depois — nunca só a primeira/última. Testado: um loop de 2 chamadas de modelo produz exatamente 2 `CostEvent`s distintos; um loop que atinge o limite de 4 iterações produz 4 `CostEvent`s (custo real nunca perdido, mesmo sem resposta final). PRE-CHECK bloqueando em qualquer iteração (não só a primeira) para o loop ali, sem gastar a chamada.

## 18. Segurança/prompt injection

Testado ponta a ponta (T3 §30/§31), não só por design: (a) mensagem do cliente com instrução de "ignorar regras" e um `tenantId` de outro tenant no próprio texto — mesmo que o modelo "obedeça" e devolva esse `tenantId` como argumento de tool call, o Broker usa só `ctx.tenantId` (contexto confiável), nunca o `input`; o lead devolvido é sempre o do tenant real. (b) resultado de tool contendo texto adversarial ("IGNORE O SISTEMA...") nunca altera quais tools/capabilities aparecem na chamada seguinte ao modelo — autorização vem só de `AgentGrant`, nunca de texto. RBAC × Agent Policy: nenhum grant coringa é representável no schema; testado que uma capability concedida não libera nenhuma outra.

## 19. Testes novos

- `packages/db/tests/unit/tools-json-schema.test.ts` — **7**.
- `packages/db/tests/integration/tool-broker.test.ts` — **23** (default-deny, grant coringa impossível, isolamento de grant, validação input/output, tenant nunca vem do modelo, IDOR, idempotência ×3, timeout, Audit ×2, RLS ×2, `mover_stage` ×3, consultas Camada 1).
- `apps/web/tests/unit/ai-provider.test.ts` — **+5** (normalização de tool calling pros dois providers).
- `apps/web/tests/integration/yalla-tool-calling.test.ts` — **5** (loop real, tool negada, limite de iterações, prompt injection, tool-output injection).

Total: **40 testes de segurança/correção novos**, todos passando. `fetch` sempre mockado — nenhuma chamada de IA real/paga em nenhum teste deste bloco.

## 20. Regressão

Tenant Core, Auth, RBAC, CRM, Kanban, Lead Capture, WhatsApp, Inbox, Yalla, T1 Gates/Audit, SecretProvider, T2 Cost Control, KeroCar, T3-A (Camada 1/broker), T3-B (Camada 2) — todos os testes pré-existentes continuam passando, incluindo os testes de `ai-provider.test.ts` adaptados à nova assinatura de `ChatMessage`/`RespostaProvider` (que já haviam sido adaptados em T2 pra `usage`; agora ganham `toolCalls`). Nenhuma quebra.

## 21. Typecheck/build

Typecheck limpo em `packages/db` e `apps/web` (`tsc --noEmit`, 0 erros). Build de produção limpo (`next build`, 21 rotas, exit code 0) — sem rota nova, já que nenhuma UI de Tool Broker/grants foi construída nesta rodada (decisão deliberada, ver Limitações).

## 22. Limitações

- Timeout de tool não cancela de fato o trabalho subjacente da Promise (mesma limitação honesta do Ai DEV) — risco prático baixo dado que as tools desta rodada são operações de banco simples, sem chamada de rede externa.
- "Nunca repetir a mesma pergunta" (T3 §17) é reforçado pela ferramenta (`nota.registrar` categoria `PENDENCIA`) e pelo system prompt do Yalla, não por uma garantia mecânica dura contra repetição — isso exigiria rastreamento de estado de diálogo mais sofisticado, fora do escopo desta rodada.
- Nenhuma UI de gerenciamento de `AgentGrant` foi construída — decisão deliberada permitida explicitamente pela autorização (T3 §33: "não é requisito se Audit já fornecer rastreabilidade suficiente"). Provisionamento é via `provisionarGrantsPadrao` (chamado pelo seed).
- Camada 3 (preço, desconto, proposta final, pagamento, estorno, cancelamento, publicação social, campanha/orçamento Ads) continua inteiramente fora de escopo — os risk levels `PRIVILEGED_WRITE`/`EXTERNAL_SIDE_EFFECT`/`FINANCIAL` existem no enum (vocabulário pronto) mas nenhuma tool os usa.
- Mesmos achados de rodadas anteriores permanecem registrados sem mudança: nenhum preço de produção cadastrado em `ModelPrice` (T2), sem conversor de moeda, expiração de Gate como sweep preguiçoso (T1).

## 23. Status Git

Este repositório **continua sem inicialização git** (`fatal: not a git repository`, reconfirmado nesta rodada). Não há branch, HEAD nem commits a reportar. `git init` não foi executado.

## 24. Veredito

**T3 CONCLUÍDO.**

Checklist do Gate Final (todos verdadeiros): Tool Registry existe (default-deny testado); tenant vem de contexto confiável, LLM não escolhe tenant (testado com tentativa real de injeção); input/output de tool são validados (Zod, testado); Tool Risk existe (vocabulário completo, 2 níveis em uso); Tool timeout existe (testado); SAFE_WRITE é idempotente (testado, replay real); Audit funciona (testado, nunca payload bruto); Cost Control cobre todas as model calls do loop (testado, não só a primeira); Camada 1 funciona (7 tools, testadas); Gate intermediário passou antes da Camada 2 (rodado e verificado nesta sessão); Camada 2 funciona (3 tools, testadas); transições críticas continuam proibidas (`mover_stage` nunca alcança GANHO/PAGO/CANCELADO/PERDIDO, testado); prompt injection não ganha permissão (testado ponta a ponta); tool-output injection não ganha permissão (testado ponta a ponta); RLS passa (testado em `AgentGrant`/`ToolCall`); regressão completa passa (293/293); typecheck passa; build passa.

## 25. Recomendação do próximo bloco

Segundo o plano mestre, os próximos blocos naturais da trilha transversal são **T4 — Model Router** e **T5 — Job Engine**, ambos explicitamente fora desta autorização e ainda dependentes de decisões que a própria autorização de T3 disse não tomar sozinha (ex.: escolha de provider de produção pra Secret Provider, de vendor pra Cost Control). Uma Camada 3 do Yalla (ações privilegiadas/financeiras/irreversíveis) só faz sentido depois de T4/T5 e de decisões comerciais explícitas do usuário sobre o que Yalla pode de fato fazer sozinho versus sempre exigir Gate. Aguardando autorização explícita — **T4 não foi iniciado automaticamente**.

---

PARAR. NÃO iniciar T4 automaticamente.
