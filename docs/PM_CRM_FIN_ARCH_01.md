# PM-CRM-FIN-ARCH-01 — Convergência CRM KeroSolar + Finance Core Internacional

Documento de arquitetura. Companheiro: `docs/PM_CRM_FIN_ARCH_01_FECHAMENTO.md` (relatório de fechamento, respostas objetivas). Base de continuidade: `RELATORIO-RECONCILIACAO-PM-CODE-HANDOFF-001.md` e `docs/PM_SANEAMENTO_01_FECHAMENTO.md`.

---

## 1. Mapa do CRM atual do Partiu

Schema real (`packages/db/prisma/schema.prisma`), lido diretamente nesta rodada:

| Model | Campos principais | Observação |
|---|---|---|
| `Tenant` | id, nome, slug, telefone, email, moeda, aiProvider, aiApiKeySecretRef | Multi-tenant real, RLS fail-closed |
| `User` | id, email, passwordHash, mustChangePassword, status | Identidade global, sem tenantId direto |
| `Membership` | userId, tenantId, roleId | Vínculo N:N User↔Tenant com papel |
| `Contact` | nome, telefone, email, whatsappId (dedup), origem | |
| `Pipeline` | nome, isDefault | Sem config de IA embutida (IA fica no Tenant) |
| `Stage` | nome, ordem, isWon, isLost | |
| `Lead` | contactId, pipelineId, stageId, responsavelId, status(ABERTO/GANHO/PERDIDO), valor, moeda, origem, **preferenciasCliente (Json)** | Sem lossReason, sem prioridade, sem score |
| `Conversation` | channel, contactId, accountId, externalId, aiEnabled, resolvedAt, lastMessageAt | |
| `Message` | direction, senderType, conteudo, externalId (dedup real via `@@unique`), mediaUrl/Type, delivered/read, failedReason | |
| `Task` | leadId, responsavelId, titulo, vencimento, **concluida (boolean)** | Sem `type`/categoria |
| `Note` | leadId, contactId, autorId, conteudo | Sem `type` estruturado — T3 usa prefixo de texto (`categoria` no input da tool, nunca vira coluna) |

RBAC (`permissions.ts`): `leads.view`/`leads.manage`/`pipeline.manage`/`atendimento.view`/`atendimento.manage`. Audit (T1) existe como infraestrutura genérica mas **não está cabeado nas ações humanas de CRM** (`apps/web/src/app/actions/leads.ts` não chama `registrarEvento` — confirmado por busca direta, zero ocorrências).

UI: `/leads` é um Kanban (colunas por Stage, `<select>` pra mover etapa — não drag-and-drop). **Não existe página de detalhe do lead** (`/leads/[id]`) — logo, não existe timeline/histórico unificado na UI, mesmo a Note/Message/Task já existindo no banco. Não existe busca nem filtro (confirmado, zero `searchParams`/filtro em `leads/page.tsx`).

## 2. Mapa do CRM KeroSolar disponível

Pesquisa dedicada (agente read-only, evidência de arquivo/linha) em `C:\Projetos\KeroSolar CRM` (repositório real, Next.js 16/React 19/**Prisma 7**/Postgres via Supabase — stack mais nova que a do Partiu, Next 14/Prisma 5).

**Confirmado ausente** (não é suposição): `Tenant`, `Membership`, RLS, qualquer coluna `tenantId`/`orgId` — **KeroSolar é single-tenant**, `User.role` é um enum plano (`admin`/`agent`), sessão carrega só `userId/name/email/role`.

Modelos CRM equivalentes: `Company`, `Contact` (com `instagramId`/`facebookId`/`customFields`/`ctwaClid`/`adReferral` — campos de atribuição de anúncio que o Partiu não tem), `Pipeline` (com config de bot/IA embutida: `botEnabled`/`botName`/`botPrompt`/`aiModel`/`sendStartHour`/`sendEndHour`), `Stage` (com `botPrompt`/`flow` Json por etapa), `Lead` (com `lossReason`, `highPriority` boolean, `source: Channel`), `Conversation`, `Message`, `Task` (com `type`/`status` enum, mais rico que o `concluida` boolean do Partiu), `Note` (com `type: "note"|"stage_change"|"system"` — discriminador estruturado que o Partiu não tem).

**Confirmado ausente também no KeroSolar**: `campaign` field, lead scoring, probabilidade, Next Best Action, tags, auditoria estruturada (zero arquivos com "audit"), busca/filtro server-side (só client-side, sobre o board já carregado).

**Domínio solar confirmado**: fica quase inteiro dentro de `Lead.customFields` (Json não tipado) — `billValue`, `consumoKwh`, `propertyType`, `roofType`, `cf.solar.{valorSistema,economiaMensal,paybackAnos,...}` — mais dois módulos de cálculo isolados (`solar-calc.ts`, `ac-calc.ts`, `card-calc.ts`) com tabelas de financiamento hardcoded em BRL. **Nenhum desses campos/módulos será portado.**

**Confirmado ausente**: nenhum pacote compartilhado (`@kero*`/`@keromind*`) existe hoje — nem no KeroSolar, nem consumido por ele. "Reaproveitar" significaria extrair pela primeira vez, não plugar em algo que já existe.

## 3. Matriz de reaproveitamento (capacidades do CRM)

`A` já genérica/reutilizável · `B` específica KeroSolar · `C` específica Partiu · `D` precisa generalizar · `E` não implementada (em nenhum dos dois, ou só no Partiu)

| Capacidade | Partiu | KeroSolar | Classificação | Nota |
|---|---|---|---|---|
| Tenant | Real, RLS | **Ausente** (single-tenant) | **A** | Já é infraestrutura genérica KeroMind — KeroSolar é quem precisaria adotar, não o inverso |
| User | Existe (global) | Existe (role plano) | **D** | Formato do Partiu (User + Membership) já é o generalizável; KeroSolar precisaria de retrofit |
| Membership | Existe | **Ausente** | **A** | — |
| Contact | Existe | Existe (+ instagramId/facebookId/adReferral) | **D** | KeroSolar tem campos de atribuição de anúncio úteis de generalizar depois (fora de escopo agora) |
| Lead | Existe | Existe (+ lossReason, highPriority) | **D** | Núcleo já convergente; faltam campos no Partiu (ver seção 5) |
| Pipeline | Existe (sem IA embutida) | Existe (IA embutida no Pipeline) | **A** (Partiu) / **B** (padrão KeroSolar) | Separar IA do Pipeline (como o Partiu já faz, via Tenant+SecretProvider) é o desenho mais correto, não um gap |
| Stage | Existe | Existe (+ botPrompt/flow) | **A** (núcleo) | flow-por-estágio é um padrão interessante, não copiado agora |
| Conversation | Existe | Existe (quase idêntico) | **A** | Já convergente — o schema do Partiu cita explicitamente a decisão do KeroSolar |
| Message | Existe | Existe (quase idêntico) | **A** | Já convergente |
| Note | Existe (sem type) | Existe (com type) | **D** | Candidato de generalização futura (ver seção 5) — não implementado agora |
| Task | Existe (boolean) | Existe (enum type/status) | **D** | Idem |
| responsável/atendente | Existe | Existe | **A** | Já convergente |
| origem do lead | Existe (string livre) | Existe (`source: Channel`, é canal de entrada, não taxonomia de marketing) | **D/E** | Nenhum dos dois tem atribuição de marketing real — ver seção 6 |
| campanha | **Ausente** | **Ausente** (confirmado) | **E** | Não implementado em lugar nenhum — é trabalho de T6 |
| histórico | Dados existem, UI não | Dados + UI (Timeline) | **D** | Partiu tem os dados (Note/Message), falta só a tela |
| atividades | idem | idem | **D** | mesma observação |
| follow-up | Existe (Task genérica) | Existe (Task com type) | **A/D** | Funcional hoje via `tarefa.criar` (T3) |
| automações | Job Engine (T5) + Tool Broker (T3) — genérico, desacoplado | Engine solar-específico, acoplado a Prisma/Next.js inline (confirmado não-portável como código) | **A** (Partiu) / **B** (KeroSolar) | A arquitetura do Partiu (Job Engine genérico) já está estruturalmente à frente aqui |
| repescagem | **Ausente** | Existe (`reengage.ts`, acoplado ao domínio solar) | **E** (Partiu) / **B** (implementação) | Padrão é portável (Job agendado + Yalla compõe mensagem), código não é — não implementado agora |
| lead scoring | **Ausente** | **Ausente** (confirmado) | **E** | — |
| prioridade | **Ausente** | Existe (boolean) | **E** (Partiu) / **D** (KeroSolar, simplista) | — |
| probabilidade | **Ausente** | **Ausente** (confirmado) | **E** | — |
| motivo de perda | **Ausente** | Existe (texto livre) | **E** (Partiu) / **D** (KeroSolar) | — |
| Next Best Action | **Ausente** | **Ausente** (confirmado) | **E** | — |
| tags | **Ausente** | **Ausente** (confirmado) | **E** | — |
| filtros | **Ausente** | Parcial (client-side só) | **E** (Partiu) / **D** (KeroSolar) | — |
| busca | **Ausente** | Parcial (client-side só) | **E** (Partiu) / **D** (KeroSolar) | — |
| Kanban | Existe (select) | Existe | **A** | Já convergente como conceito |
| timeline | Dados sim, UI não | Dados + UI | **D** | Mesmo caso de "histórico" |
| auditoria | Infra genérica (T1) existe, **não cabeada em ações de CRM humanas** | **Ausente** (confirmado, zero arquivos) | **A** (infra) / **D** (aplicação ao CRM) | — |

## 4. CRM Core proposto

**Não extraído como pacote nesta rodada** (ver seção 22 da autorização / seção 8 deste documento — risco/esforço não justificam agora). O "CRM Core" nesta fase é **este documento + a matriz acima**, funcionando como especificação de referência: qualquer evolução futura do CRM do Partiu (ou de um terceiro produto CRM da KeroMind) deve olhar pra essa matriz antes de inventar um campo novo.

Formato já convergente e recomendado como baseline: `Contact` → `Lead` (pipeline/stage/responsável/status/valor+moeda/origem/**customFields JSON pro domínio específico**) → `Conversation` → `Message`, com `Task`/`Note` como atividade. É exatamente o padrão que o Partiu já usa (`preferenciasCliente` é o `customFields` do Partiu).

## 5. Domínio específico KeroSolar (confirmado, não portar)

`billValue`, `consumoKwh`, `propertyType`, `roofType`, campos `cf.solar.*` (valorSistema/economiaMensal/paybackAnos/economia30Anos/menorParcela), tabelas de financiamento (`TABELA_FINANCIAMENTO_PADRAO`, `TABELA_CARTAO`), cálculo de ar-condicionado (`ac-calc.ts`), prompts do bot solar ("Sol"), simulador público de energia solar. Nada disso tem qualquer relação com turismo.

## 6. Domínio específico Partiu (turismo)

Já implementado via `Lead.preferenciasCliente` (Json validado por Zod — `packages/db/src/tools/definitions/lead.ts`): datasDesejadas, quantidadePassageiros, preferenciaRoteiro, orcamentoInformado, idioma, observacoes. Funil de referência (seção 5 da autorização) — **preservado sem alteração automática**: o Kanban atual usa o `Pipeline`/`Stage` já configurado (`Novo lead → Contato feito → Proposta enviada → Fechado/Perdido`, do seed); os estágios adicionais do funil completo (roteiro de interesse, negociação, reserva, pagamento, documentação, viagem confirmada, em viagem, pós-viagem) **não foram criados** — isso seria antecipar o motor de propostas/reservas, explicitamente fora de escopo (seção 24).

## 7. Finance Core proposto

Implementado nesta rodada como **contratos TypeScript puros, sem tabela nova, sem migration** (`packages/db/src/finance/`): `LegalEntity`, `Market`, `FiscalProfile`, `CountryPack`, `ExchangeRateQuote`. Nenhum desses é persistido em banco ainda — a decisão de "quando" virar tabela real fica para quando um consumidor real existir (ex.: quando o motor de proposta/reserva for autorizado). Ver `packages/db/src/finance/types.ts` para os contratos completos e comentados.

Registry de Country Pack (`country-pack-registry.ts`) segue o mesmo padrão default-deny já comprovado em Tool Registry (T3) e Job Registry (T5): nenhum pack é assumido, `obterCountryPack("PT")` devolve `undefined` hoje — testado (`tests/unit/finance-country-pack-registry.test.ts`, 6 testes).

## 8. LegalEntity

Contrato definido (`types.ts`): `id, tenantId, legalName, tradeName?, country, taxIdentifier?, baseCurrency, timezone, fiscalProfileId?, status, metadata?`. **Nenhum campo fiscal é validado** — `taxIdentifier`/`country` são strings livres, propositalmente, até que um Country Pack real defina o formato esperado.

## 9. Market

Contrato definido: `codigo, nome, idiomaPadrao, idiomasPermitidos[], moedaPadrao, moedasPermitidas[], timezone`. Deliberadamente **sem** os campos de conteúdo/SEO/ofertas/meios-de-pagamento/canais/campanhas que a autorização lista como "poderá definir futuramente" — esses são trabalho de F2/F4, não desta rodada. `Market` não define tributação sozinho (reforçado no comentário do tipo).

## 10. Currency/FX

Contrato `ExchangeRateQuote` definido com todos os campos pedidos (baseCurrency/transactionCurrency/displayCurrency/rate/source/timestamp/fxMargin/roundingRule/lockedExchangeRate/priceValidity). **Nenhuma função de cálculo de impacto foi implementada** — nada no código atual consome isso ainda (não existe Proposal/preço público para recalcular), então construir a função de impacto agora seria antecipar F2/motor de proposta. Princípio "câmbio ≠ preço" documentado no comentário do tipo, não implementado como lógica ainda (não há o que proteger sem um preço público existente).

## 11. FiscalProfile

Contrato definido (`id, jurisdiction, countryPackId, vigenteDesde, metadata?`). **Vazio de propósito** — nenhuma instância real, nenhuma regra. `jurisdiction` é resultado de uma determinação futura (Country Pack + Legal Entity), nunca um espelho direto de idioma/moeda/país do cliente — a autorização é explícita sobre isso (seção 9) e o tipo está comentado reforçando essa regra.

## 12. CountryPack contract

`id, nome`, mais 3 métodos **opcionais** (`calcularImposto?`, `documentosObrigatorios?`, `validarLegalEntity?`) — um pack pode existir sem implementar nenhum, testado explicitamente. Nenhum pack real (PT ou BR) está registrado.

## 13. Relação Finance Core × Cost Control

Nenhum acoplamento interno criado — `CostEvent` (T2) continua exclusivamente sobre custo técnico de IA/API, por provider/model/capability. A autorização (seção 18) já antecipa que o Finance Core deve **futuramente** conseguir agregar esse custo como dimensão gerencial (receita − fornecedores − comissões − marketing − IA/APIs − outros = margem) — isso é trabalho de quando o Finance Core tiver receita/despesa real para cruzar, não desta rodada.

## 14. Relação Marketing × Finance

Nenhuma implementação — arquiteturalmente compatível (ver seção 15 abaixo sobre attribution-readiness), sem decisão que bloqueie o funil `AD → CLICK → SESSION → LEAD → CONVERSATION → PROPOSAL → SALE → PAYMENT → REVENUE → MARGIN → PROFIT` descrito na autorização (seção 19) de ser construído depois.

## 15. CRM Core attribution-ready (sem implementar T6)

Análise (não implementação): `Lead.origem`/`Contact.origem` são strings livres nullable hoje — adicionar campos de atribuição estruturados no futuro (source/medium/campaign/content/term/utm/gclid/fbclid/landingPage/referrer/firstTouch/lastTouch/conversionTouch) é uma migration aditiva simples (colunas nullable novas, ou um `Json` como `preferenciasCliente` já usa) — **nada na arquitetura atual bloqueia isso**. Decisão deliberada de **não adicionar essas colunas agora** (colunas vazias que nada usa seriam antecipar T6, proibido explicitamente).

## 16. Diagrama de arquitetura

```
                         KEROMIND (plataforma)
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   Tenant Core            CRM Core (spec)         Finance Core (contratos)
   (RLS, Auth,            — este documento é        packages/db/src/finance/
   RBAC, Gates,             a especificação de       LegalEntity · Market ·
   Audit, Secret            referência; nenhum       FiscalProfile ·
   Provider, Cost           pacote extraído          CountryPack (registry
   Control, Tool             ainda                    vazio) · ExchangeRateQuote
   Broker, Job Engine)                                       │
        │                       │                    ┌──────┴────────┐
   ┌────┴────┐            ┌─────┴─────┐          Country Pack    Country Pack
   │         │            │           │           Portugal        Brasil
KeroSolar  Partiu     KeroSolar    Partiu          (futuro,        (futuro,
(externo,  (este      (implementa  (implementa    NÃO             NÃO
single-    repo)      solar-       turismo-       implementado    implementado
tenant,                specific    specific        nesta rodada)  nesta rodada)
sem RLS)               em cima     em cima
                        da spec)    da spec
```

Nenhuma seta nova foi de fato construída nesta rodada entre KeroSolar e um pacote compartilhado — o diagrama mostra a direção-alvo (seção 2 da autorização), não o estado implementado.

## 17. Alterações realizadas

- `packages/db/src/finance/{types.ts,country-pack-registry.ts,index.ts}` (novo).
- `packages/db/src/index.ts` — 1 linha (`export * from "./finance"`).
- `packages/db/tests/unit/finance-country-pack-registry.test.ts` (novo, 6 testes).
- Este documento + `docs/PM_CRM_FIN_ARCH_01_FECHAMENTO.md`.

## 18. Alterações NÃO realizadas (deliberadamente)

- Nenhuma tabela nova (`LegalEntity`/`Market`/`FiscalProfile` ficaram só como tipos TS).
- Nenhuma migration.
- Nenhum campo novo em `Lead`/`Contact`/`Note`/`Task` (as generalizações identificadas na matriz — `Note.type`, `Task.type`, `Lead.lossReason`/`prioridade` — ficam como recomendação, não implementadas).
- Nenhuma extração de pacote compartilhado `@keromind/crm-core`.
- Nenhuma regra fiscal de Portugal ou Brasil.
- Nenhuma alteração no repositório do KeroSolar (não tocado, é sistema separado em produção).
- Nenhuma tela nova (timeline, busca, filtro).

## 19. Migrations

**Nenhuma.** 24 migrations continuam aplicadas, nenhuma nova — confirmado (`prisma migrate status`).

## 20. Testes

274 no total (192 em `packages/db`, incluindo os 6 novos de Finance Core; 82 em `apps/web`, inalterado) — todos passando. Detalhe completo no relatório de fechamento.

## 21. Riscos

- Nenhum risco técnico introduzido (zero schema/migration, zero mudança em código existente além de 1 export).
- Risco de **não fazer nada** com a matriz da seção 3: as generalizações identificadas (Note.type, Task.type, Lead.lossReason/prioridade, tela de detalhe/timeline) são melhorias reais e de baixo risco — ficam documentadas para quando forem priorizadas, não perdidas.
- Risco de convergência forçada com KeroSolar (ver seção 22 — por isso não foi tentada).

## 22. Dependências

Nenhuma dependência externa nova. A convergência real de código com KeroSolar dependeria de: alinhamento de versão (Prisma 5↔7, Next 14↔16), infraestrutura de pacote compartilhado (inexistente hoje), e decisão de retrofit de multi-tenant no KeroSolar (sistema em produção, fora de qualquer autorização recebida).

## 23. Decisões (*)

- **(\*) Convergência de código CRM com KeroSolar** — ver as 3 opções + recomendação na seção "Gate de segurança" do relatório de fechamento.
- **(\*) Quando promover LegalEntity/Market de tipo TS para tabela real** — só quando houver um consumidor real (motor de proposta/reserva, ainda não autorizado).
- **(\*) Quando generalizar Note.type/Task.type** — melhoria de baixo risco identificada, não priorizada nesta rodada.
- **(\*) Extração de pacote `@keromind/crm-core`** — decisão de infraestrutura maior, não tomada aqui.

## 24. Recomendação da próxima etapa

Ver seção 30 do relatório de fechamento.
