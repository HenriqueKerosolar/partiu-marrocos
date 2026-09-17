# Relatório de Reconciliação — PM-CODE-HANDOFF-001

Produzido conforme exigido pela seção 13 do documento `Partiu_Marrocos_Handoff_Code_Especificacao_Completa_v1.0.docx` (PM-CODE-HANDOFF-001 v1.0, 15/09/2026). **Nenhum código foi alterado para gerar este relatório** — é puramente leitura/auditoria do estado real do repositório em `D:\Projetos\Agencia de turismo internacional`, comparado item a item com o documento.

---

## 1. Branch/commit atual e estado do working tree

**Este repositório nunca foi inicializado como Git** (`git status` → `fatal: not a git repository`). Não há branch, commit nem histórico a reportar — confirmado nesta rodada, mesmo estado de todas as rodadas anteriores (T1 a T5-FIX). Todo o trabalho está no working tree local, sem versionamento. `git init` não foi executado (não autorizado).

## 2. Mapa do repositório e módulos existentes

Monorepo pnpm: `apps/web` (Next.js 14 App Router) + `packages/db` (Prisma/Postgres) + `packages/config`.

`packages/db/src/`: `tenant-db.ts`, `cross-tenant.ts`, `permissions.ts`, `audit.ts`, `gates.ts`, `secret-provider.ts`, `cost-control.ts`, `tools/` (Tool Broker: `registry.ts`, `broker.ts`, `grants.ts`, `jsonSchema.ts`, `definitions/`), `jobs/` (Job Engine), `device-auth.ts`, `vehicle-gateway.ts`, `seed.ts`.

`apps/web/src/app/`: `(app)/{dashboard,leads,inbox,canais,frota,gates,custos,jobs}`, `actions/{leads,whatsapp,ai}.ts`, `api/{auth,public/leads,webhooks/whatsapp,vehicle,frota,gates}`, `lib/{session,rbac,rate-limit,ai/{provider,yalla}}`.

`site-original/partiumarrocos.com.br/`: site público estático (HTML/CSS/JS + PHP mínimo para o painel admin) — **fora do monorepo/stack Next.js**, tratado como projeto à parte nesta sessão (extraído do ZIP fornecido pelo fundador em 14/09).

11 documentos de especificação/plano na raiz (`DOCUMENTO-DE-FUNDACAO-PARTIU-MARROCOS.md`, `PLANO-MESTRE-EXECUCAO.md`, `MATRIZ-FINAL-REAPROVEITAMENTO.md`, `PADRAO-DESENVOLVIMENTO-KEROMIND.md`, `PERGUNTAS-ABERTAS.md`, `KEROCAR-DOMINIO-VEICULO.md`) + 6 relatórios de fechamento (`RELATORIO-FECHAMENTO-{T1,T2,T3,T5,T5-FIX,PM-BLOQ-001}.md`).

## 3. Itens do documento comprovadamente implementados

| Item do handoff (seção) | Evidência real |
|---|---|
| Tenant Core / RLS (5, 6) | `tenant-db.ts`, `rls.sql`, RLS `FORCE` em toda tabela tenant-scoped, testes negativos cross-tenant em 7+ suítes de integração |
| Auth/RBAC (3.1, 6) | `lib/session.ts`, `lib/rbac.ts`, cookie httpOnly, `mustChangePassword`, `Role`/`Permission`/`RolePermission` por tenant |
| T1 Gates + Audit (5, 6) | `gates.ts`, `audit.ts`, `AuditLog` append-only (trigger de banco), decisor sempre `User` real (autoaprovação por agente estruturalmente impossível) |
| PM-BLOQ-001 SecretProvider (6) | `secret-provider.ts`, AES-256-GCM local, `Tenant.aiApiKey`/`WhatsappAccount.accessToken`/`appSecret` migrados para `secretRef` — nenhum valor em texto plano no schema |
| T2 Cost Control | `cost-control.ts`: `CostEvent` (Decimal, nunca float), `CostPolicy`, pré-check/pós-registro, integração com Gate, anti-loop testado |
| T3 Tool Broker + Yalla Camadas 1/2 | `tools/`, default-deny (`AgentGrant`), `ToolCall` idempotente, 7 tools reais, `lead.mover_stage` nunca alcança GANHO/PERDIDO, tool-calling estruturado real (Anthropic/OpenAI) em `provider.ts` |
| T5 Job/Execution Engine | `jobs/`: `Job`≠`Execution`, claim via `SKIP LOCKED`, lease+heartbeat com fencing real, retry/backoff exponencial, dead-letter, `WorkerHeartbeat`, 1º caso real = reenvio de WhatsApp |
| T5-FIX (hardening) | Timeout HTTP real via `AbortController` propagado do Job para o `fetch`, observabilidade mínima de fila, correção de flake de teste, auditoria de timestamp |
| CRM básico (3.2) | `Contact`, `Lead`, `Pipeline`, `Stage`, `Conversation`, `Message`, `Note`, `Task` — Kanban funcional em `/leads` |
| WhatsApp Cloud API (3.8) | `cloud-api.ts`, webhook com verificação HMAC, dedup real (`@@unique` em `externalId`), multi-tenant — **mas nunca validado contra uma conta WABA real** (ver seção 6) |
| Captura pública de lead + integração com o site (3.1, item "Pendente" na tabela 3 do handoff) | **Divergência a favor** — ver seção 7 |

## 4. Itens parcialmente implementados

| Item | O que existe | O que falta |
|---|---|---|
| Yalla comercial (3.3) | Consulta lead/contato/conversa, classifica, move stage por regra, cria nota/tarefa, encaminha humano — tudo via Tool Broker testado | Não tem detecção de idioma nem qualquer lógica de tradução; roda só dentro do CRM autenticado, não no site público |
| Atendimento humano + IA (3.4) | Handoff Yalla→humano via `Conversation.aiEnabled=false` + resumo estruturado | Sem fila de atendimento, sem noção de disponibilidade/fuso do atendente, sem fallback formal "sem humano disponível" |
| Site público (3.1) | Identidade cinematográfica preservada; formulário grava lead real; painel admin com senha real+rate limit (corrigido nesta sessão) | Sem landing pages por campanha, sem SEO técnico, sem i18n, sem termos/cookies/cancelamento, sem Yalla embutido |
| RBAC/Gates/Audit (6) | Implementados e testados no CRM (T1) | `tenantId` do site público nunca é enviado pelo cliente-alvo de ataque (usa `tenantSlug` fixo do CONFIG), mas a rota pública em si roda sem sessão — por design, não é uma lacuna, mas vale registrar que é um perímetro diferente do resto do RBAC |
| Uploads seguros (6) | Painel do site: SVG removido do allowlist, mime-check, rate limit (corrigido nesta sessão) | Nenhuma verificação de conteúdo além de extensão+MIME (ex.: não decodifica a imagem para confirmar que não é um polyglot) |

## 5. Itens que não existem no repositório

Confirmado por grep direto no schema e no código-fonte, não por suposição:

- **Internacionalização (3.5)**: nenhuma coluna de `idioma`/`locale`/`fuso`/`moeda-do-cliente` no schema (só uma menção dentro de um JSON livre em `Lead.preferenciasCliente`, não estruturada). Nenhum roteamento por mercado.
- **Câmbio/preço multi-moeda (3.6)**: `Lead.valor`/`moeda` existem como campos soltos; não há tabela de cotação, margem cambial, alerta de variação nem aprovação de alteração de preço.
- **Voz e tradução (3.7)**: zero ocorrências de ElevenLabs/transcrição/tradução no código. O webhook do WhatsApp tem um comentário explícito: mídia de áudio/imagem/vídeo só grava o tipo recebido (`[audio]` etc.), "download/transcrição fica para a próxima fase — não faz parte do escopo mínimo".
- **Marketing KeroMind (3.9)**: nenhuma captura de `utm_*`/`gclid`/`fbclid` em `POST /api/public/leads` nem em nenhum outro lugar. Sem GA4/Search Console/Ads/Meta. T6 (Attribution) não iniciado.
- **Propostas/reserva/pagamento/documentação (3.10)**: nenhum model `Proposal`/`Reservation`/`Payment`/`Document` no schema.
- **Área do viajante (3.11)**: não existe (o próprio handoff diz "escopo ainda não congelado, não implementar por suposição" — respeitado).
- **Lead scoring / Next Best Action (3.2)**: nenhum campo de score/probabilidade no schema — o handoff já classifica isso como "evolução", não MVP.
- **T4 Model Router**: não iniciado, confirmado (nenhum arquivo `packages/db/src/model-router*` ou equivalente).
- **Notifications, Command Center, Country Packs**: não existem — mesmo estado "Projetado" que a tabela do próprio handoff já indica.

## 6. Itens que dependem de credenciais/contas externas

Nenhuma dessas está configurada no ambiente atual (`.env` só tem `DATABASE_URL`/`JWT_SECRET`/`SESSION_COOKIE_NAME`/`SECRET_PROVIDER*`/`NODE_ENV` — confirmado por inspeção de nomes, nunca de valores):

- **WABA real** — WhatsApp Cloud API nunca testado contra uma conta/número real. Bloqueador explícito de produção (handoff seção 3.8 e tabela 3).
- **GA4 / Search Console / Google Ads / Meta Ads** — zero integração, zero conta de teste.
- **ElevenLabs** — nenhuma chave, nenhuma integração de código.
- **Provider de produção do SecretProvider** — só a implementação `local` (AES-256-GCM em banco) existe; nenhum vendor de nuvem (AWS/GCP/Azure/Vault) foi escolhido, por decisão explícita de escopo em PM-BLOQ-001.
- **Domínio real do site público** — `PUBLIC_SITE_ORIGIN` não está definido no `.env` real (só documentado em `.env.example`); hoje o CORS cai no fallback permissivo (`*`).

## 7. Divergências entre documentação e código

**A favor do código (o handoff está desatualizado neste ponto):**
A tabela 3 do handoff lista *"Site/repositório definitivo | Pendente | Necessário para integrar captura real"*. **Isso não está mais correto** — nesta mesma sessão, mais cedo hoje (14-15/09), o fundador forneceu o ZIP do site real (`partiumarrocos.com.br.zip`), e a integração foi feita e testada ponta a ponta: formulário do site → `POST /api/public/leads` → `Contact`/`Lead`/`Note` gravados no CRM → só depois abre o WhatsApp. No caminho, foi encontrado e corrigido um bug real: o middleware de auth do Next.js devolvia 401 para qualquer chamada a `/api/public/*` (inclusive o preflight de CORS), o que teria impedido essa integração de funcionar mesmo já "pronta" no código da rota. Também foram corrigidas, nesta mesma rodada: senha hardcoded do painel admin do site, upload de SVG sem sanitização, e um ZIP de trabalho (`partiu-marrocos-cinema-WIP`) que estava dentro da pasta de deploy. Isso ainda não virou um relatório de fechamento formal de bloco (não foi pedido dentro de uma autorização T-numerada) — fica registrado aqui.

**A favor do documento (achado real, não mascarado):**
- **KeroCar ainda não foi separado deste repositório.** A memória desta sessão registra "KeroCar extraído para projeto próprio (`D:\Projetos\OBD2`)", mas o `schema.prisma` **atual** ainda contém `Device`, `Vehicle`, `TelemetryEvent`, `DtcEvent`, `SecurityEvent`, `MaintenanceRecord`, `permissions.ts` ainda tem `frota.view`/`frota.manage`, e `/frota` continua ativo em `apps/web`. Ou a extração aconteceu só no outro projeto (cópia paralela) e este repositório nunca teve o domínio removido, ou a memória está desatualizada. **Não presumi qual das duas é verdade — registro a divergência para o fundador decidir.**
- O handoff (seção 5) diz *"Fechamento conhecido de T5 registrou 337 testes totais passando"*. O estado real **agora** é **355** (228 em `packages/db` + 127 em `apps/web`) — maior, não menor, porque T5-FIX e a integração do site adicionaram testes novos depois daquele número ter sido registrado. Não é uma regressão, é a suíte ter crescido.

## 8. Testes atuais e resultado real

Executado agora, não copiado de relatório anterior:

| Pacote | Testes | Resultado |
|---|---|---|
| `packages/db` (unit + integration) | 228 | **228 passando** |
| `apps/web` (unit + integration) | 127 | **127 passando** |
| **Total** | **355** | **355 passando, 0 falha** |

`typecheck` limpo nos dois pacotes (`tsc --noEmit`, 0 erros). Build de produção (`next build`) limpo, 22 rotas, sem erro — última execução verificada nesta sessão, após religar o servidor de preview (a primeira tentativa estourou memória por causa de processos de dev rodando em paralelo; não é falha de código).

## 9. Migrations pendentes

**Nenhuma.** `prisma migrate status` → "23 migrations found... Database schema is up to date!" — confirmado nesta rodada.

## 10. Riscos de segurança/regressão conhecidos

Consolidado dos relatórios de fechamento anteriores + achados desta sessão, nada omitido:

- WhatsApp nunca testado contra WABA real — primeira mensagem real pode revelar problema de configuração não visível em teste local.
- `SecretProvider` só tem implementação local (dev) — sem vendor de produção escolhido.
- Expiração de `Gate` é sweep "preguiçoso" (checado na leitura, não proativo) — sem Job Engine dedicado a isso (T5 existe, mas não foi cabeado para essa finalidade especificamente).
- Nenhum preço de produção cadastrado em `ModelPrice` (T2) — todo custo de IA real hoje classificaria como `UNKNOWN` até alguém cadastrar preços homologados.
- Timeout de Tool Broker (T3) não cancela de fato o trabalho subjacente da Promise em alguns caminhos (mesma limitação documentada do Ai DEV Orquestrador) — mitigado para o Job Engine em T5-FIX (`AbortSignal` real), mas não retroagiu para o Tool Broker síncrono.
- Site público: `.htaccess` que protege `config.php`/`_lib.php`/pasta de rate-limit só foi testado por leitura de sintaxe — o servidor de desenvolvimento usado nesta sessão (`php -S`) não honra `.htaccess`; precisa confirmação em Apache/cPanel real antes de considerar essa proteção comprovada em produção.
- `PUBLIC_SITE_ORIGIN` não configurado — CORS do endpoint público está permissivo (`*`) até o domínio real do site ser definido.
- KeroCar/Partiu compartilham `schema.prisma`/`permissions.ts`/`layout.tsx` (achado antigo do plano mestre, seção M) — ver divergência da seção 7 acima.

## 11. Decisões do fundador (*)

Compiladas da tabela 3 do handoff + achados desta reconciliação — nenhuma decisão foi tomada por mim, todas seguem em aberto:

- **(*) Horário humano** — define fallback e agendamento de atendimento.
- **(*) Política de voz** — define áudio automático e qual voz usar (ElevenLabs) antes de qualquer implementação de 3.7.
- **(*) Área do viajante V1** — escopo ainda não congelado.
- **(*) Regras fiscais por país** — depende de contador/estrutura societária, fora do controle técnico.
- **(*) T4 Model Router** — autorização explícita necessária antes de iniciar.
- **(*) Domínio real de produção do site** — necessário para configurar `PUBLIC_SITE_ORIGIN` corretamente (hoje em fallback permissivo).
- **(*) Conta WABA real de teste** — necessário para validar WhatsApp em produção (bloqueador repetido em três documentos diferentes: auditoria original, plano mestre, e este handoff).
- **(*) KeroCar: extrair deste repositório ou manter compartilhado?** — achado desta reconciliação (seção 7); o plano mestre já tinha uma proposta de fronteira desenhada (não implementada) para quando isso fosse decidido.
- **(*) Vendor de produção do SecretProvider** — nenhum escolhido (AWS Secrets Manager, GCP, Azure Key Vault, Vault).
- **(*) Preços reais para `ModelPrice`** — quem homologa e cadastra os preços de produção dos providers de IA.

## 12. Recomendação do próximo bloco — SEM executar

Pela ordem natural do roadmap (tabela 4 do handoff) e pelo estado real comprovado acima, os candidatos são:

1. **Fechar F1 de verdade** — validar WhatsApp contra uma conta WABA real (bloqueador repetido em 3 documentos) antes de somar mais funcionalidade em cima de uma integração nunca testada ao vivo.
2. **T6 — Attribution (UTM/gclid/fbclid)** — pré-requisito técnico pequeno e bem definido para todo o capítulo de Marketing KeroMind (3.9); hoje a origem do lead não carrega nenhum dado de campanha.
3. **T4 — Model Router** — próximo da trilha transversal original, mas o handoff é explícito: não iniciar automaticamente.
4. **F2 — i18n/Portugal** — maior escopo, zero base pronta em qualquer projeto da casa (confirmado na auditoria original), só faz sentido depois de F1 fechado de verdade.

Não iniciei nenhum desses. **PARADO, aguardando autorização explícita do fundador — nenhum bloco novo, T4 ou F2-F6, foi iniciado.**
