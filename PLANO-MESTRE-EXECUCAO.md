# PARTIU MARROCOS / KEROMIND — Plano Mestre de Execução

**Status: PLANEJAMENTO. Nada foi implementado, corrigido, commitado ou modificado nesta rodada.**

Fonte primária usada (nenhuma redescoberta): `AUDITORIA-CONGAONE.md`, `AUDITORIA-KEROSOLAR-CRM-COMPLETA.md`, `AUDITORIA-AI-DEV-ORQUESTRADOR-COMPLETA.md`, `MATRIZ-FINAL-REAPROVEITAMENTO.md`, `DOCUMENTO-DE-FUNDACAO-PARTIU-MARROCOS.md`, `README.md` (estado real do repositório, mantido por mim durante a implementação), `PERGUNTAS-ABERTAS.md` e as decisões que o usuário acabou de fechar nesta mensagem.

---

## A. RESUMO EXECUTIVO

O Partiu Marrocos já tem uma fundação funcionando de ponta a ponta: Tenant Core com RLS testado, auth/RBAC, CRM básico (Lead/Pipeline/Stage/Contact/Conversation/Message/Note/Task) com Kanban, captura pública de lead, WhatsApp Cloud API multi-tenant e um Yalla que responde (sem agir ainda). Isso já é mais do que qualquer produto individual da casa tinha isoladamente — inclusive corrige lacunas reais que as auditorias acharam no KeroSolar CRM (multi-tenant, timeout/retry de IA) e no CongáOne (gap de RBAC).

O Ai DEV Orquestrador entrega, testado e maduro, exatamente o que falta pro próximo salto: governança (Gates), rastreabilidade (Audit), controle de gasto de IA (Cost Control), roteamento resiliente de modelo (Model Router) e fila assíncrona (Job Engine). Nenhum desses 5 é específico de desenvolvimento de software — são genéricos o bastante pra virar módulo compartilhado da KeroMind, mas hoje vivem presos a SQLite/instalação única e precisam de trabalho de generalização antes de servir mais de um produto.

A decisão estrutural desta rodada é: **não empilhar tudo dentro do Partiu**. Trilha comercial (vender/atender/operar) e trilha transversal KeroMind (Gates/Audit/Cost/Router/Jobs) andam em paralelo, sem a segunda atrasar a primeira.

---

## B. DECISÕES CONSOLIDADAS

Registrando como fechadas, exatamente como recebidas:

| # | Decisão |
|---|---|
| 1 | Ordem de extração de KeroModules: **Gates+Audit** (tratados como uma unidade) → **Cost Control** → **Model Router** → **Job Engine** |
| 2 | KeroModules não pertencem ao Partiu — destino futuro é `KeroMind Shared Modules`. Nesta rodada só fronteiras/contratos/ownership, não implementação |
| 3 | Compartilhamento é de **código/contrato**, não necessariamente de banco central. Isolamento por tenant (RLS+FK composta, hoje só no Partiu) é a referência a preservar ou melhorar — nunca regredir para isolamento só por convenção (que é o que o Ai DEV tem hoje) |
| 4 | Yalla evolui para tool-calling, autonomia progressiva por risco (3 camadas — seção D abaixo). Arquitetura e contratos nesta rodada, não implementação |
| 5 | Tool Broker do Ai DEV usado como referência de avaliação, não porte cego — plano de adaptação de contrato (seção E) |
| 6 | UTM/gclid/fbclid: **decisão fechada** — entra na próxima etapa de implementação, antes de tráfego pago relevante começar |
| 7 | Social media real: não descartado, não bloqueia o lançamento — planejado para a fase de Marketing, só API oficial |
| 8 | DPAPI: não vale investir especificamente pro Partiu — planejar abstração `SecretProvider`. `Tenant.aiApiKey` em texto plano fica registrado como **BLOQUEADOR DE PRODUÇÃO** até existir secret management adequado |
| 9 | Site público: integra assim que ZIP/repositório definitivo estiver disponível — dependência externa, não tarefa de programação |
| 10 | GA4/Search Console/Google Ads/Meta Ads: classificação "implementação existente + validação externa pendente" — gate de validação por provider, não bloqueia arquitetura |
| 11 | Roadmap: **não** inverter F3/F5 simplesmente. Duas trilhas paralelas — comercial (F0-F6) preservada + transversal KeroMind (T1-T8) — a transversal nunca atrasa o que é essencial pra vender/atender/operar |

---

## C. ARQUITETURA ALVO

```
┌─────────────────────────────────────────────────────────────┐
│  KEROMIND SHARED MODULES (futuro — não existe ainda)          │
│  Gates/Approval · Audit · Cost Control · Model Router ·        │
│  Job Engine · Tool Broker (contrato) · Notifications (futuro)  │
│  → distribuído como CÓDIGO/CONTRATO (pacote), não banco único  │
└─────────────────────────────────────────────────────────────┘
              ▲ consome como dependência          ▲
              │                                    │
┌──────────────────────────┐         ┌──────────────────────────┐
│  PARTIU MARROCOS          │         │  KEROCAR / OUTROS         │
│  Tenant Core (RLS+FK)     │         │  (hoje: mesmo banco que   │
│  CRM · WhatsApp · Yalla   │         │   o Partiu — seção H)     │
│  dados tenant-scoped      │         │  dados tenant-scoped      │
└──────────────────────────┘         └──────────────────────────┘
```

Princípio: os módulos compartilhados exportam **schema/contrato/lógica pura** (ex.: máquina de estado de um Gate, regra de bloqueio de custo, algoritmo do Router) — cada produto os instancia sobre o **próprio** Tenant Core (Postgres+RLS+FK composta), nunca sobre um banco central de propriedade de um módulo. Isso preserva o isolamento que o Partiu já validou com 38+ testes negativos e evita o problema que o Ai DEV tem hoje (multi-tenant só por convenção de código, sem RLS).

---

## D. YALLA — CAMADAS DE AUTONOMIA (arquitetura, não implementação)

| Camada | Ações | Gate necessário? |
|---|---|---|
| **1 — Consulta/registro** | consultar lead/contato/conversa/info autorizada; registrar Note; criar Task/follow-up; atualizar dado que o próprio cliente informou; registrar interesse/intenção/preferência | Não — READ_ONLY/SAFE_WRITE no vocabulário do Tool Broker auditado |
| **2 — Decisão de regra clara** | mover estágio quando a regra é inequívoca; classificar lead; agendar retorno; encaminhar pra humano; pedir informação faltante | Não, mas sempre auditado (quem/qual regra/resultado) |
| **3 — Ação de risco** | alterar preço; aplicar desconto; emitir proposta final; compromisso comercial; pagamento; estorno; cancelamento; publicar conteúdo; alterar campanha/orçamento de Ads; ação irreversível; acesso privilegiado | **Sim — Gate obrigatório, sem exceção** |

Isso mapeia diretamente pros 5 níveis de risco que a auditoria do Ai DEV já comprovou funcionais no Tool Broker (`READ_ONLY, SAFE_WRITE, PRIVILEGED_WRITE, EXTERNAL_SIDE_EFFECT, FINANCIAL`) — a Camada 3 é exatamente os 3 níveis mais altos, que no Ai DEV hoje têm o mecanismo pronto mas zero tool de produção os usa. O Partiu seria o primeiro a de fato ter tools nesses níveis.

---

## E. TOOL BROKER — PLANO DE ADAPTAÇÃO DE CONTRATO

Baseado só no que a auditoria comprovou (seção 4 da auditoria Ai DEV: 232/232 testes, pipeline real ToolRegistry→Grant→PolicyEngine→validação Zod→execução→auditoria).

| Conceito | Existe no Ai DEV (comprovado) | Adaptar para o Partiu |
|---|---|---|
| `ToolDefinition` | Sim — `toolRegistry.ts`, 11 tools reais com `inputSchema`/`outputSchema` Zod | Reaproveitar o formato; as 11 tools são todas de arquivo/git — nenhuma serve ao CRM, todas as tools do Yalla são NOVAS |
| `ToolInput`/`ToolOutput` | Sim — validação Zod bidirecional | Reaproveitar padrão direto |
| `ToolRisk` | Sim — enum de 5 níveis, `GATED_RISK_LEVELS` sempre exige gate | Reaproveitar o enum; mapeia 1:1 com as 3 camadas da seção D |
| `ToolExecution` | Sim — `withTimeout()`, execução real | Reaproveitar padrão |
| `ToolAuthorization` | Sim — grant por tupla `(project_id, agent_id, capability, environment, risk_level)`, default-deny | Trocar `project_id` por `tenantId` real do Tenant Core (RLS resolve o resto) |
| `ToolAudit` | Sim — `AuditEvent` em cada etapa (`requested/allowed/started/completed/failed/denied`) | Mapeia direto pro KeroModule Audit (bloco D/E abaixo) |
| `ToolGate` | Sim — abre `HumanGate` nos 3 níveis mais altos | Mapeia direto pro KeroModule Gates |
| `ToolTimeout` | Sim | Reaproveitar |
| `ToolRetry` | **NÃO COMPROVADO** no Tool Broker em si (existe no Model Router, não no Broker) | Precisa decisão de design nova — nem toda tool é idempotente o bastante pra retry automático |
| `ToolIdempotency` | **NÃO COMPROVADO** — busca da auditoria não achou idempotência de efeito de tool | Precisa ser desenhado do zero, principalmente pras tools de Camada 3 (pagamento/estorno não podem duplicar) |

---

## F. GATES + AUDIT — PRIMEIRO BLOCO TRANSVERSAL (T1)

Campos comprovados na auditoria (`human_gates` + `audit_events`, Ai DEV seções 5 e 19) vs. o que precisa adaptar vs. o que é proposta nova:

| Campo | Status |
|---|---|
| `tenantId` | **NOVO PROPOSTO** — o Ai DEV usa `project_id`/`workspace_id` (multi-tenant lógico); o Partiu precisa do `tenantId` real sob RLS |
| `actor` (formato `human:X` / `orchestrator` / `agent:yalla`) | **CAMPO EXISTENTE** — comprovado por CHECK de banco real no Ai DEV (`granted_by LIKE 'human:%'` obrigatório pra aprovação de negócio) |
| `userId` | **CAMPO A ADAPTAR** — Ai DEV correlaciona por `actor` textual; Partiu já tem `User.id` real, deve usar FK de verdade |
| `agentId` | **NOVO PROPOSTO** — hoje só existe "Yalla" como agente único; se no futuro houver mais de um agente de IA, precisa de identificador |
| `executionId` | **NOVO PROPOSTO** — conceito do Job Engine (T4), só faz sentido quando esse módulo existir |
| `toolId` | **NOVO PROPOSTO** — só existe quando o Tool Broker (seção E) tiver tools reais registradas |
| `risk`/`category` | **CAMPO EXISTENTE** — comprovado: ~19 categorias reais no Ai DEV (`financial_operation, ad_budget, campaign_publication, service_contracting, data_deletion, cost_increase, external_publication, irreversible`, entre outras) — cobrem exatamente os domínios de negócio do Partiu, reaproveitável quase direto |
| `reason`/`risk_description`/`alternatives` | **CAMPO EXISTENTE** — comprovado |
| `status` (`pending/approved/rejected/modified/expired`) | **CAMPO EXISTENTE** — comprovado, com máquina de estado testada |
| `requestedAt`/`created_at` | **CAMPO EXISTENTE** |
| `approvedAt`/`deniedAt`/`decided_at` | **CAMPO EXISTENTE** |
| `expiresAt` | **CAMPO EXISTENTE** — comprovado, com sweep de expiração real |
| `result`/`metadata` | **CAMPO EXISTENTE** |
| Append-only garantido em nível de banco (trigger, não só convenção) | **CAMPO/MECANISMO EXISTENTE** — comprovado por teste real (`UPDATE` via SQL bruto lança exceção) — Postgres tem o mesmo recurso de trigger, deve ser preservado |

**Segundo mecanismo do Ai DEV, distinto de Gate** (seção 5 da auditoria): `HumanActionRequest` — "preciso que você faça algo que só você pode fazer" (OAuth, MFA, colar API key, consentimento, pagamento). É separado de `HumanGate` ("posso fazer isto?"). Os dois precisam ser avaliados — o Partiu provavelmente precisa dos dois (ex.: `HumanActionRequest` pra quando o Yalla precisar que o vendedor confirme um pagamento manual; `HumanGate` pra quando o Yalla quiser dar 15% de desconto sozinho).

---

## G. COST CONTROL — PLANEJADO APÓS GATES/AUDIT

Da auditoria (seção 9): o mecanismo bloqueante real (`checkAndEnforceLimit`, abre gate + bloqueia ao atingir 100% do teto) depende do Gate já existir — por isso a ordem importa. Escopo comprovado: custo por task/cycle/project_day/provider/model/capability/agente. Câmbio para o Partiu: trocar `project` por `tenantId`. Lucro/margem/CFO Agent **não existe em lugar nenhum da casa** — exige billing/pricing real, fora do escopo deste bloco.

## H. MODEL ROUTER — PLANEJADO APÓS COST CONTROL

Objetivo: "Capability/Vendor Router" — capability, provider, model, custo, qualidade, disponibilidade, quota, contexto, latência, fallback, failover — tudo comprovado funcional (107/107 testes) no Ai DEV. **Não substituir o provider simples do Yalla agora** — ele resolve o caso de uso atual (1 provider por vez, timeout+retry); o Router só compensa o esforço quando houver necessidade real de multi-provider (ex.: fallback automático em pico de uso, ou seleção por custo em escala).

## I. JOB/EXECUTION ENGINE — PLANEJADO POR ÚLTIMO NESTA TRILHA

| Capacidade | Status no Ai DEV (comprovado) | Para o Partiu |
|---|---|---|
| Job/Task/Execution, status, fila | REUTILIZÁVEL (desenho) | Adaptar SQL (SQLite→Postgres); lógica de `UPDATE...WHERE status=X AND changes>0` é portável quase 1:1 |
| Retry, timeout | REUTILIZÁVEL (desenho) | Retry pós-falha de execução **não é automático** no Ai DEV (exige ação administrativa) — decidir se o Partiu quer isso automático |
| Dependency entre tasks | REUTILIZÁVEL (desenho, `WorkStep.depends_on`) | Adaptar |
| Priority + fairness | REUTILIZÁVEL (desenho, testado) | Adaptar |
| Pause/resume de fila | **NÃO EXISTE** no Ai DEV | NOVO, se for requisito do Partiu |
| Blocked reason / resume condition | REUTILIZÁVEL (`tasks.blocked_reason`/`resume_state`) | Adaptar |
| Gate integrado à fila | REUTILIZÁVEL (comprovado) | Adaptar |
| Worker, lease, heartbeat | REUTILIZÁVEL (comprovado sob concorrência real) | Adaptar |
| Limite por CPU/tokens/provider | **NÃO IMPLEMENTADO nem no Ai DEV** (só contagem de execuções) | NOVO em ambos |
| Audit integrado | REUTILIZÁVEL | Adaptar |

Resolveria de forma genérica a limitação real que o Partiu **já tem hoje**, documentada no próprio README: reenvio de WhatsApp via `setInterval` em processo único (mesma limitação que o KeroSolar CRM tem, nunca resolvida em nenhum dos dois).

---

## J. INVENTÁRIO DE CAPACIDADES

| Capacidade | Já existe no Partiu? | Origem | Comprovada? | Testada? | Pronta p/ produção? | Precisa adaptar? | KeroModule? | Fase | Bloqueio | Próxima ação |
|---|---|---|---|---|---|---|---|---|---|---|
| Tenant Core (RLS+FK composta) | **SIM** | CongáOne (porte) | Sim | Sim (12+ testes negativos) | Sim | Não | — | F0 (feito) | Nenhum | Manter como está |
| Auth/Sessão revogável | **SIM** | CongáOne+fabricaease (combinado) | Sim | Sim | Sim | Não | — | F0 (feito) | Nenhum | — |
| RBAC | **SIM** | CongáOne (mecanismo) | Sim | Sim | Sim | Não | Candidato futuro | F0 (feito) | Nenhum | — |
| CRM (Lead/Pipeline/Stage/Contact) | **SIM** | Forma do KeroSolar CRM, tenantId desde o dia 1 | Sim | Sim | Sim | Não | — | F1 (feito) | Nenhum | Filtro/busca, motivo de perda padronizado |
| Captura pública de lead | **SIM** | Novo (Partiu) | Sim | Sim (7 testes) | Sim (backend) | Site público ainda não chama | — | F1 (feito) | Dependência externa (seção K) | Integrar JS do site quando disponível |
| Kanban | **SIM** | Novo (Partiu) | Sim | Verificado ao vivo | Sim | Não | — | F1 (feito) | Nenhum | Filtro/busca |
| WhatsApp Cloud API | **SIM** | KeroSolar CRM (adaptado) | Sim | Sim (9+6 testes) | Sim (arquitetura); falta validar conta real em produção | Não | Candidato (KeroModule WhatsApp, fora desta trilha) | F1 (feito) | Credencial real de produção | — |
| Inbox | **SIM** | Novo (Partiu) | Sim | Verificado ao vivo | Sim | Não | — | F1 (feito) | Nenhum | — |
| Yalla (resposta simples) | **SIM** | KeroSolar CRM (referência) + gaps corrigidos | Sim | Sim (6 testes) | Sim (transporte); nunca chamado contra API real | Sim (evoluir p/ tool-calling) | — | F1 (feito) | `aiApiKey` texto plano | Ver bloqueador de produção (seção L) |
| Gates/Approval | NÃO | Ai DEV Orquestrador | Sim (49 testes) | Sim | Não (multi-tenant só lógico) | Sim (tenantId real) | **SIM — T1** | Transversal | Nenhum técnico | Primeiro bloco a desenhar em detalhe (feito na seção F) |
| Audit Log | NÃO | Ai DEV Orquestrador | Sim (append-only por trigger) | Sim | Não (idem) | Sim | **SIM — T1** | Transversal | Nenhum técnico | Junto com Gates |
| Cost Control | NÃO | Ai DEV Orquestrador | Sim (156 testes) | Sim | Não (idem) | Sim | **SIM — T2** | Transversal | Depende de Gates existir | Depois de T1 |
| Model Router | NÃO | Ai DEV Orquestrador | Sim (107 testes) | Sim | Não (credencial não é por tenant) | Sim | **SIM — T4** | Transversal | Nenhum técnico, baixa urgência | Depois de T2 |
| Tool Broker (arquitetura) | NÃO | Ai DEV Orquestrador (referência) | Sim (232 testes, só READ/SAFE) | Sim | Não | Sim (tools novas de negócio) | **SIM — T3** | Transversal | Nenhum técnico | Ligado à evolução do Yalla |
| Job/Execution Engine | NÃO | Ai DEV Orquestrador | Sim (52+ testes) | Sim | Não | Sim | **SIM — T5** | Transversal | Nenhum técnico | Por último nesta trilha |
| GA4 | NÃO | Ai DEV Orquestrador | Código real | Não (nunca validado ao vivo) | **NÃO** | Sim | Candidato (B) | F4 | Falta conta de teste real | Aguardar decisão/conta (pergunta 3 do doc de perguntas abertas) |
| Search Console | NÃO | Ai DEV Orquestrador | Código real | Não | **NÃO** | Sim | Candidato (B) | F4 | Idem | Idem |
| Google Ads | NÃO | Ai DEV Orquestrador | Código real, execução deliberadamente ausente | Não | **NÃO** | Sim | Candidato (B) | F4 | Idem | Idem |
| Meta Ads | NÃO | Ai DEV Orquestrador | Código real, execução deliberadamente ausente | Não | **NÃO** | Sim | Candidato (B) | F4 | Idem | Idem |
| Attribution (UTM/gclid/fbclid) | NÃO | Ai DEV (algoritmo) + decisão nova | Algoritmo real, dado vazio | Não | **NÃO** | Sim | Candidato (D→futuro C) | F4/T6 | Nenhum | **Decidido: implementar na próxima rodada** (decisão 6) |
| Social Publishing real | NÃO | Nenhum projeto da casa tem | Não (fake em 2 projetos) | N/A | **NÃO** | N/A | Futuro | F4 | Depende de API oficial de cada rede | Não prioridade agora (decisão 7) |
| i18n / multi-idioma | NÃO | Nenhum projeto da casa tem | — | — | — | — | Construir do zero | F2/F3 | Nenhum técnico, é trabalho novo | — |
| Multi-moeda | PARCIAL | `Tenant.moeda`/`Lead.moeda` existem no schema, sem lógica de câmbio | — | — | — | — | Construir do zero | F2 | Nenhum | — |
| Timezone | NÃO | Nenhum projeto da casa tem base pronta | — | — | — | — | Construir do zero | F3 | Nenhum | — |
| ElevenLabs/voz | NÃO | Nenhum projeto da casa tem | — | — | — | — | Construir do zero | F3 | Nenhum | — |
| Country Packs (fiscal multi-país) | NÃO | Nenhum projeto da casa tem base real | — | — | — | — | Construir do zero | F2/F6 | Nenhum técnico, decisão fiscal/legal | — |
| Finance/Fiscal | NÃO | Nenhum projeto da casa tem base reaproveitável (KeroSolar tem cálculo específico de solar, não serve) | — | — | — | — | Construir do zero | F6 | Decisão fiscal/legal | — |
| Notifications | NÃO | **Não encontrado em nenhum projeto da casa** | Não | N/A | **NÃO** | N/A | Construir do zero | F4/T-futuro | Nenhum técnico | — |
| Command Center / Intelligence | NÃO | Composição futura de Gates+Audit+Cost+Router | — | — | — | — | Composição de T1-T5 | F5 | Depende de T1-T5 | — |

---

## K. DEPENDÊNCIAS EXTERNAS (não são tarefa de programação)

| Dependência | Necessária para | Responsável |
|---|---|---|
| Acesso ao ZIP/repositório definitivo do site público | Integrar captura de lead real (seção 9 das decisões) | Cliente/fundador |
| Conta real GA4 de teste | Validar integração antes de confiar (decisão 10) | Cliente/fundador |
| Conta real Search Console de teste | Idem | Cliente/fundador |
| Conta real Google Ads de teste | Idem | Cliente/fundador |
| Conta real Meta Ads/WABA de teste | Idem + validar WhatsApp em produção real | Cliente/fundador |
| Domínio e hospedagem de produção | Sair do ambiente local (Postgres embutido, dev) | Cliente/fundador |
| Dados comerciais reais (preços, pacotes, condições) | Conteúdo real do CRM/site, já sinalizado como pendente na auditoria original do site | Cliente/fundador |
| Provas sociais validadas (números, depoimentos) | Idem — achado da primeira auditoria do site (textos não comprovados) | Cliente/fundador |
| Regras fiscais por país (Country Pack) | Bloqueador de F6, fora do escopo técnico | Cliente/fundador + contador |
| Horário de atendimento humano definido | Regra de fallback do Yalla fora do horário (pergunta ainda aberta desde o doc original do KeroMind) | Cliente/fundador |
| Política de voz/consentimento (clonagem de voz) | Pré-requisito de F3 (ElevenLabs) | Cliente/fundador |

---

## L. BLOQUEADORES

| Categoria | Bloqueio | Origem | Impacto | Responsável | Condição para liberar |
|---|---|---|---|---|---|
| **Produção** | `Tenant.aiApiKey` em texto plano no banco | Achado desta rodada (decisão 8) | Alto — chave de IA de cada cliente exposta a qualquer acesso direto ao banco | Eu (técnico) | Implementar `SecretProvider` (abstração) antes de qualquer cliente real usar o Yalla em produção |
| **Produção** | WhatsApp nunca validado contra conta/WABA real | Auditoria KeroSolar (o design é bom, mas nunca testado ao vivo no Partiu) | Médio-alto — primeira mensagem real pode revelar problema de configuração | Cliente (fornecer conta) + eu | Conta WABA real de teste |
| **Produção** | GA4/Search Console/Ads/Meta nunca validados contra conta real (nem no Ai DEV, nem em lugar nenhum) | Auditoria Ai DEV | Médio — só bloqueia quando esses módulos forem portados | Cliente (fornecer contas) | Contas de teste (seção K) |
| **Comercial** | Site público (ZIP) não chama o endpoint de captura de lead ainda | Achado crítico da primeira auditoria, ainda não resolvido na ponta do site | Alto — continua perdendo lead até isso ser integrado | Cliente (acesso ao site) + eu | Acesso ao repositório/ZIP definitivo |
| **Comercial** | Dados reais (preço, condição, prova social) não validados | Primeira auditoria do site | Alto — conteúdo publicado hoje tem afirmação não comprovada | Cliente | Validação um a um dos textos |
| **Fiscal/Legal** | Nenhuma estrutura de Country Pack existe | Nenhum projeto da casa | Baixo agora, alto na Fase 6 | Cliente + contador | Definição de estrutura societária internacional (já sinalizado como "ainda não definido" no doc original do KeroMind) |
| **Desenvolvimento** | Nenhum dos 5 KeroModules candidatos (Gates/Audit/Cost/Router/Jobs) tem plano de extração aprovado além do que este documento propõe | Esta rodada | Nenhum ainda — é o objetivo da próxima decisão (pergunta final, seção N) | Eu | Autorização explícita do bloco a seguir |
| **Homologação** | Partiu e KeroCar compartilham um `schema.prisma` e um `permissions.ts` únicos | Achado desta rodada (seção H abaixo) | Baixo hoje, cresce com o tempo | Eu + dono do KeroCar | Definir fronteira antes de qualquer um dos dois escalar times separados |

---

## M. SEPARAÇÃO PARTIU / KEROCAR — ANÁLISE (sem mover código)

Evidência real, lida agora nos arquivos do repositório:

- **`packages/db/prisma/schema.prisma`**: um único arquivo contém os modelos do Partiu (`Lead`, `Pipeline`, `Contact`, `Conversation`, `WhatsappAccount`...) e os do KeroCar (`Device`, `Vehicle`, `TelemetryEvent`, `DtcEvent`...) lado a lado, na mesma migration history.
- **`packages/db/src/permissions.ts`**: catálogo único de permissões com chaves dos dois domínios misturadas (`leads.*`, `atendimento.*`, `whatsapp.*` do Partiu; `frota.*` do KeroCar) no mesmo array `PERMISSIONS`.
- **`apps/web/src/app/(app)/layout.tsx`**: navegação única com links condicionais por permissão dos dois domínios (`/leads`, `/inbox`, `/canais` do Partiu; `/frota` do KeroCar) no mesmo componente.
- **Isso é real, mas não é acoplamento de domínio** — é compartilhamento de *infraestrutura* (Tenant Core, schema técnico de RLS, layout de app). Nenhum model do Partiu referencia um model do KeroCar (ou vice-versa) por FK, nenhuma rota de um domínio importa lógica de negócio do outro.
- **Risco de monólito acidental**: existe, e cresce proporcionalmente ao número de domínios que continuarem sendo adicionados ao mesmo `schema.prisma`/`permissions.ts`/`layout.tsx`. Hoje (2 domínios) é gerenciável; com 4-5 domínios ficaria frágil.

**Fronteira proposta (não implementada agora):**
```
SHARED PLATFORM CORE          → Tenant, User, Membership, Role, Permission,
                                 RolePermission, Session, AuditLog (genéricos,
                                 sem nada de CRM nem de veículo)
PARTIU DOMAIN                 → Contact, Pipeline, Stage, Lead, Conversation,
                                 Message, Task, Note, WhatsappAccount
KEROCAR DOMAIN                 → Device, Vehicle, TelemetryEvent, DtcEvent,
                                 SecurityEvent, MaintenanceRecord
```
Cada domínio poderia futuramente virar um `schema.prisma` parcial (Prisma suporta múltiplos arquivos desde versões recentes) ou até um pacote/schema Postgres separado — mas isso é decisão de infraestrutura pra quando (se) o Partiu e o KeroCar precisarem escalar times/deploys de forma independente. Hoje, dividir prematuramente custaria mais do que economiza.

---

## N. MVP REAL DO PARTIU

Critério: impacto em venda + atendimento + operação + segurança + medição — não "já existe código".

**MVP — OBRIGATÓRIO PARA OPERAR**
- Tenant Core, Auth, RBAC (✅ feito)
- CRM + Kanban (✅ feito)
- Captura pública de lead (✅ backend feito — falta integração do site, bloqueador externo)
- WhatsApp Cloud API + Inbox (✅ feito — falta validar conta real)
- `SecretProvider` (abstração de secret) — **falta**, é bloqueador de produção real (seção L)

**MVP — DESEJÁVEL**
- Yalla respondendo automaticamente (✅ feito, sem tool-calling)
- Filtro/busca no Kanban e no Inbox — falta

**PÓS-MVP**
- Yalla com tool-calling (Camadas 1-2 da seção D)
- Gates/Audit (T1)
- i18n/multi-moeda (Fase 2 — Portugal)

**KEROMIND TRANSVERSAL** (não bloqueia o Partiu)
- Cost Control, Model Router, Job Engine (T2, T4, T5)
- GA4/Search Console/Ads/Meta (validação + porte)
- Attribution real (UTM/gclid/fbclid — decisão 6, mas é implementação, não é bloqueio do MVP em si)

**EXPERIMENTAL/LAB**
- Social publishing real
- Yalla Camada 3 (ações financeiras/irreversíveis autônomas)
- Command Center completo

---

## O. ROADMAP COMERCIAL (trilha preservada)

| Fase | Objetivo | Status |
|---|---|---|
| F0 | Bloqueadores de segurança | ✅ Feito (Fase A — CongáOne, fabricaease, KeroSolar CRM, KeroIA Estética corrigidos) |
| F1 | Funil comercial (CRM+WhatsApp+captura) | ✅ Feito nesta fundação |
| F2 | Portugal (i18n, moeda, fuso) | Não iniciado — nenhum projeto da casa tem base |
| F3 | Atendimento internacional (voz, tradução) | Não iniciado — nenhum projeto da casa tem base |
| F4 | Marketing (GA4/Ads/Meta/social/atribuição) | Não iniciado — Ai DEV entrega boa parte da leitura/recomendação, nunca validada ao vivo |
| F5 | Command Center | Não iniciado — mas a fundação (Gates/Audit/Cost) é a mais madura de toda a auditoria |
| F6 | Escala SaaS / fiscal multi-país | Não iniciado — depende de decisão societária externa |

## P. ROADMAP TRANSVERSAL KEROMIND (paralelo, sem atrasar o comercial)

| Trilha | Objetivo | Depende de |
|---|---|---|
| T1 | Gates + Audit | Nada técnico — pode começar assim que autorizado |
| T2 | Cost Control | T1 (Gate precisa existir pro bloqueio de custo funcionar) |
| T3 | Tool Broker mínimo pro Yalla | D (camadas de autonomia) definidas; pode andar em paralelo a T1/T2 |
| T4 | Model Router | T2 (opcional andar em paralelo, baixa urgência) |
| T5 | Job Engine | Nenhuma dependência técnica; prioridade baixa até haver necessidade real de fila (ex.: volume de WhatsApp) |
| T6 | Attribution | Decisão 6 já fechada — pode começar a captura de UTM assim que alguém tocar no endpoint público de novo |
| T7 | Marketing Connectors (GA4/Ads/Meta) | Contas de teste reais (seção K) |
| T8 | Intelligence/Command Center | T1-T5 prontos |

---

## Q. PARALELISMO

- **Trilha A (comercial/site)**: integração do site público — depende só de acesso externo (seção K), não de nada técnico interno. Pode rodar em paralelo a qualquer trilha técnica.
- **Trilha B (Gates/Audit — T1)**: pode começar imediatamente, zero dependência externa.
- **Trilha C (i18n — F2)**: trabalho novo, não depende de nenhuma auditoria — pode rodar em paralelo às trilhas B/T3, mas compete por atenção de desenvolvimento com F1 (que ainda tem itens desejáveis pendentes, como filtro/busca).
- **Trilha D (homologação externa — GA4/Ads/Meta/WABA)**: bloqueada até o cliente fornecer contas de teste — não é paralelismo real até essa dependência ser resolvida, é espera.

**Não forçado**: T2 (Cost Control) não roda em paralelo a T1 — depende estruturalmente dele (o bloqueio de custo abre um Gate). F3 (voz/tradução) não roda em paralelo a nada agora porque não há decisão de escopo ainda (nenhuma pergunta sobre isso foi respondida).

---

## R. GAPS QUE PRECISAM SER CONSTRUÍDOS DO ZERO (confirmado — nenhum projeto da casa tem base)

i18n/multi-idioma · lógica de câmbio (campos existem, lógica não) · timezone · ElevenLabs/voz · Country Packs fiscais · motor de billing/pricing real (pré-requisito de qualquer "margem"/CFO Agent) · Notifications (in-app/push/e-mail/webhook) · Social publishing real (API oficial) · captura de atribuição (UTM/gclid/fbclid) · SEO keyword research/ranking tracking · tools de negócio do Yalla (Camadas 2-3) · idempotência de tool.

---

## S. PRÓXIMO BLOCO RECOMENDADO — RESPOSTA À PERGUNTA OBRIGATÓRIA

### "Qual é o primeiro bloco que deve ser autorizado para implementação agora?"

**T1 — Gates + Audit Log**, adaptados pro Tenant Core do Partiu (RLS+FK composta), conforme desenhado na seção F.

**Justificativa:**
- **Impacto**: é o único bloco que destrava, ao mesmo tempo, a Camada 3 do Yalla (seção D — nenhuma ação de risco pode existir sem Gate), o Cost Control (T2 depende estruturalmente dele) e o Command Center (F5, cuja fundação MAIS madura de toda a auditoria é exatamente Gates+Audit).
- **Dependências**: zero dependência externa (nenhuma conta de terceiro, nenhum acesso pendente) — pode começar imediatamente, diferente de T6/T7/F4 que esperam o cliente.
- **Risco**: baixo — é o componente mais testado e mais comprovado de toda a auditoria do Ai DEV (49/49 testes, mecanismo já usado por múltiplos domínios de negócio reais naquele projeto), e o Partiu já tem o Tenant Core pronto pra receber o `tenantId` real que falta hoje no Ai DEV.
- **Reaproveitamento**: altíssimo — schema, categorias de risco (~19, cobrindo financeiro/ads/publicação/dado) e máquina de estado já vêm prontos e testados; o trabalho real é troca de `project_id`→`tenantId` e adaptação de SQLite→Postgres com trigger append-only.
- **Efeito sobre o resto do roadmap**: sem Gate, a Camada 3 do Yalla não pode existir com segurança, o Cost Control não tem onde bloquear, e o Command Center não tem trilha de auditoria confiável. É o bloco que, uma vez pronto, desbloqueia mais coisas ao mesmo tempo do que qualquer outro candidato desta lista.

---

## T. PLANO DE EXECUÇÃO COM IDs

IDs estáveis, prefixo `PM-` (Partiu Marrocos). Itens de F0/F1 já concluídos ficam registrados para rastreabilidade, não para reexecução. Itens distantes (F5/F6/T7/T8) recebem um ID de bloco só, sem quebra artificial em tarefa-a-tarefa que ainda não foi desenhada.

| ID | Fase/Trilha | Objetivo | Dependências | Origem do código | Reutilização | Arquivos/áreas prováveis | Testes necessários | Gate | Critério de aceite | Risco | Bloqueia próximo? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PM-F0-001 | F0 | Fundação: Tenant Core RLS+FK composta | — | CongáOne (porte) | Direto | `packages/db` | Integração (isolamento negativo) | Não | ✅ Concluído — 38+ testes passando | — | — |
| PM-F0-002 | F0 | Correção de bugs de segurança nos projetos fonte | — | CongáOne/fabricaease/KeroSolar/KeroIA (achados das auditorias) | N/A | Fora deste repo | Testes existentes de cada projeto | Não | ✅ Concluído | — | — |
| PM-F1-001 | F1 | Auth/RBAC | PM-F0-001 | CongáOne+fabricaease (combinado) | Adaptando | `apps/web/src/lib/{jwt,session,rbac}.ts` | Unit | Não | ✅ Concluído | — | — |
| PM-F1-002 | F1 | Schema CRM (Lead/Pipeline/Stage/Contact/Conversation/Message) | PM-F0-001 | Forma do KeroSolar CRM | Adaptando (+tenantId) | `packages/db/prisma/schema.prisma` | Integração | Não | ✅ Concluído | — | PM-F1-003, PM-F1-004 |
| PM-F1-003 | F1 | WhatsApp Cloud API multi-tenant + webhook HMAC | PM-F1-002 | KeroSolar CRM (`cloud-api.ts`) | Adaptando | `apps/web/src/lib/whatsapp/`, `app/api/webhooks/whatsapp` | Integração (isolamento) + unit (HMAC) | Não | ✅ Concluído — 9+6 testes | Credencial real não validada (ver PM-BLOQ-002) | — |
| PM-F1-004 | F1 | Yalla — resposta simples (sem tool-calling) | PM-F1-003 | KeroSolar CRM (referência) + gaps corrigidos (timeout/retry) | Referência (D) | `apps/web/src/lib/ai/` | Unit (mock de provider) | Não | ✅ Concluído — 6 testes | `aiApiKey` texto plano (ver PM-BLOQ-001) | — |
| PM-F1-005 | F1 | Kanban de leads | PM-F1-002 | Novo | — | `apps/web/src/app/(app)/leads/` | Verificado ao vivo | Não | ✅ Concluído | — | — |
| PM-F1-006 | F1 | Captura pública de lead | PM-F1-002 | Novo | — | `apps/web/src/app/api/public/leads/` | Integração (7 testes) | Não | ✅ Concluído (backend) | Site público não chama ainda (PM-BLOQ-003) | — |
| PM-F1-007 | F1 | Filtro/busca no Kanban e Inbox | PM-F1-005 | Novo | — | `apps/web/src/app/(app)/{leads,inbox}/` | Unit+integração | Não | Pendente | Baixo | — |
| PM-BLOQ-001 | Transversal | `SecretProvider` — abstração de secret (tira `aiApiKey` de texto plano) | PM-F1-004 | Ai DEV Orquestrador (referência de Secret Vault, não o backend DPAPI) | Referência de contrato, não código | `packages/db`, `apps/web/src/lib/ai/` | Unit | Não | Chave nunca lida em texto plano fora do momento de uso | Médio se adiado até produção real | Produção com cliente real |
| **PM-T1-001** | **T1 (recomendado agora)** | **Desenhar schema Gate/Approval + Audit para o Tenant Core** | Nenhuma | Ai DEV Orquestrador (`human_gates`, `audit_events`) | Adaptando (seção F) | `packages/db/prisma/schema.prisma` (novo bloco), `packages/db/src/gates.ts`, `audit.ts` | A definir na implementação | — | Schema revisado batendo com a tabela da seção F | Baixo | PM-T1-002 |
| PM-T1-002 | T1 | Implementar máquina de estado do Gate (pending/approved/rejected/modified/expired) + trigger append-only no Audit | PM-T1-001 | Ai DEV Orquestrador (lógica), Postgres (trigger — equivalente ao SQLite) | Adaptando | `packages/db/src/gates.ts` | Integração (append-only, transições inválidas) | — | Testes negativos provando append-only e transição inválida rejeitada | Baixo | PM-T1-003 |
| PM-T1-003 | T1 | Expor Gate no fluxo do Yalla (Camada 3 da seção D) — ainda sem tools reais de Camada 3 | PM-T1-002 | Novo (integração) | — | `apps/web/src/lib/ai/yalla.ts` | Integração | Sim (é o próprio Gate) | Uma ação simulada de risco abre Gate e bloqueia até decisão humana | Baixo | PM-T3-001 |
| PM-T2-001 | T2 | Cost Control — cálculo + teto + bloqueio via Gate | PM-T1-002 | Ai DEV Orquestrador (`costController.ts`) | Adaptando | `packages/db/src/cost.ts` | Integração (bloqueio real ao atingir teto) | Sim (usa PM-T1) | Chamada de IA acima do teto é bloqueada e abre Gate | Baixo | — |
| PM-T3-001 | T3 | Tool Broker mínimo — registry+grant+policy+validação Zod, só Camada 1 (seção D) | PM-T1-003 | Ai DEV Orquestrador (arquitetura, seção E) | Adaptando (arquitetura), tools 100% novas | `apps/web/src/lib/tools/` | Unit (schema) + integração (autorização) | Não (Camada 1) | Yalla consulta lead/contato/conversa via tool validada, audita a chamada | Médio (idempotência/retry não comprovados no Ai DEV, precisa desenho próprio) | PM-T3-002 |
| PM-T3-002 | T3 | Tools de Camada 2 (mover estágio, classificar, agendar) | PM-T3-001 | Novo | — | `apps/web/src/lib/tools/` | Integração | Não | Regra inequívoca move lead sem intervenção, audita | Médio | PM-T3-003 |
| PM-T3-003 | T3 | Tools de Camada 3 (preço, desconto, proposta, pagamento) | PM-T3-002, PM-T1-003, PM-T2-001 | Novo | — | `apps/web/src/lib/tools/` | Integração + segurança (nunca sem Gate) | Sim, sempre | Nenhuma ação de Camada 3 executa sem Gate aprovado — testado adversarialmente | Alto (financeiro/irreversível) | — |
| PM-T4-001 | T4 | Model Router — porte do desenho (falha/failover/circuit breaker) | PM-T2-001 (recomendado, não estritamente obrigatório) | Ai DEV Orquestrador (`router.ts`+`circuitBreaker.ts`) | Adaptando (credencial por tenant real, não por projeto) | `apps/web/src/lib/ai/router.ts` | Unit (mesma matriz de 9 cenários da auditoria) | Não | Falha de 1 provider troca pro outro sem intervenção manual | Baixo | — |
| PM-T5-001 | T5 | Job/Execution Engine — fila com lease/heartbeat/dead-letter | Nenhuma | Ai DEV Orquestrador (`executionRepository.ts`) | Adaptando (SQLite→Postgres) | `packages/db/src/jobs.ts` | Integração (concorrência real, mesmo teste de 5 conexões da auditoria) | Não | Reenvio de WhatsApp passa a usar fila em vez de `setInterval` único | Médio | — |
| PM-T6-001 | T6 | Captura de UTM/gclid/fbclid no endpoint público | PM-F1-006 | Decisão 6 (fechada) | Novo | `apps/web/src/app/api/public/leads/route.ts` | Integração | Não | Lead criado via link com UTM preserva os parâmetros | Baixo | — |
| PM-F2-001 | F2 | i18n/multi-idioma — desenho | PM-F1-* | Nenhum projeto da casa | Nenhuma | A definir | A definir | — | A definir | Alto (escopo grande, zero base) | F3 |
| PM-F2-002 | F2 | Lógica de câmbio (campo já existe: `Tenant.moeda`/`Lead.moeda`) | PM-F2-001 | Nenhum projeto da casa | Nenhuma | `packages/db`, novo serviço de câmbio | A definir | Sim (mudança de preço público) | A definir | Médio | — |
| PM-F3-001 | F3 | Atendimento internacional (voz/tradução, ElevenLabs) — bloco único, não decomposto | PM-F2-001 | Nenhum projeto da casa | Nenhuma | A definir | A definir | Sim (voz clonada exige consentimento) | A definir | Alto | — |
| PM-F4-001 | F4 | Marketing Connectors (GA4/Search Console/Ads/Meta) — bloco único | Contas reais de teste (PM-DEP-*) | Ai DEV Orquestrador | Adaptando (B) | `apps/web/src/lib/marketing/` | Validação contra API real (não mockada) | Não (leitura) | Cada provider lê dado real e bate com o painel oficial | Médio | — |
| PM-F5-001 | F5 | Command Center — composição de T1+T2+T4+T5 | PM-T1 a PM-T5 | Composição interna | — | A definir | A definir | — | A definir | Baixo (é composição, não construção nova) | — |
| PM-F6-001 | F6 | Escala SaaS / Country Pack fiscal — bloco único | Decisão societária externa | Nenhum projeto da casa | Nenhuma | A definir | A definir | Sim (sempre) | A definir | Alto | — |

---

**Aguardando autorização explícita. Nada foi implementado.**
