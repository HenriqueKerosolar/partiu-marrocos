# PM-SANEAMENTO-01 — Relatório de Fechamento

Saneamento arquitetural KeroCar + fechamento técnico da F1 do Partiu Marrocos. Base: `RELATORIO-RECONCILIACAO-PM-CODE-HANDOFF-001.md` (não refeito do zero — só os pontos necessários foram reconfrontados com o estado atual).

**Nota de transparência sobre a sequência real desta rodada**: a remoção do domínio KeroCar (migration destrutiva + código) **já havia sido executada** — sob autorização direta e explícita do fundador em chat ("sim kerocar saiu daqui dessa pasta, nada haver com o projeto, pode até limpar qualquer referência") — no momento em que o protocolo formal PM-SANEAMENTO-01 chegou, pedindo o mapeamento/matriz completo *antes* de qualquer remoção. As 6 tabelas foram confirmadas vazias (0 linhas) antes do DROP, o que satisfaz a exceção da seção 12 do protocolo ("não há dados... e a alteração é necessária"). O mapeamento completo (seção 2 abaixo) e o restante deste protocolo foram executados **depois**, de forma retroativa, para confirmar — não presumir — que a remoção já feita foi de fato segura e completa, e para fazer o resto (verificação de F1, regressão, relatório) com o rigor pedido. Nenhuma tentativa foi feita de esconder essa ordem dos fatos.

---

## 1. Por que o KeroCar estava presente no repositório?

Resíduo da fundação original deste monorepo: o Tenant Core (RLS, FK composta, padrão pnpm/Next/Prisma) foi construído aqui para servir como base compartilhada, e o domínio de telemetria veicular do KeroCar foi desenvolvido em cima dela nesta mesma árvore antes de o KeroCar virar projeto próprio. `PLANO-MESTRE-EXECUCAO.md` (seção M, "Separação Partiu/KeroCar") já registrava isso como um "risco de monólito acidental" conhecido e não resolvido, com uma fronteira proposta mas nunca implementada.

## 2. Quais componentes KeroCar foram encontrados? (mapeamento completo)

| Item | Arquivo/Tabela | Classificação | Referenciado por | Risco de remoção | Destino |
|---|---|---|---|---|---|
| `Device` | `prisma/schema.prisma` → tabela `devices` | **A** | `Vehicle`, `TelemetryEvent`, `DtcEvent`, `SecurityEvent` (FK), `device-auth.ts`, `vehicle-gateway.ts`, `/api/frota/dispositivos*`, `/frota/[id]` | Baixo (0 linhas) | Removido |
| `Vehicle` | tabela `vehicles` | **A** | `Device`, `TelemetryEvent`, `DtcEvent`, `SecurityEvent`, `MaintenanceRecord` (FK), `/api/frota/veiculos*`, telas `/frota` | Baixo (0 linhas) | Removido |
| `TelemetryEvent` | tabela `telemetry_events` | **A** | `/api/vehicle/telemetry`, `vehicle-gateway.ts` | Baixo (0 linhas) | Removido |
| `DtcEvent` | tabela `dtc_events` | **A** | `/api/vehicle/dtc`, `vehicle-gateway.ts` | Baixo (0 linhas) | Removido |
| `SecurityEvent` | tabela `security_events` | **A** | `/api/vehicle/security-events`, `vehicle-gateway.ts` | Baixo (0 linhas) | Removido |
| `MaintenanceRecord` | tabela `maintenance_records` | **A** | `/frota/[id]/adicionar-manutencao-form.tsx`, `/api/frota/veiculos/[id]/manutencoes` | Baixo (0 linhas) | Removido |
| `packages/db/src/vehicle-gateway.ts` | módulo | **A** | rotas `/api/vehicle/*`, testes unit/integration | Baixo | Removido |
| `packages/db/src/device-auth.ts` | módulo | **A** | rotas `/api/vehicle/*`, `/api/frota/dispositivos/[id]/rotacionar` | Baixo | Removido |
| `apps/web/src/app/api/vehicle/{dtc,security-events,telemetry}` | 3 rotas | **A** | `device-auth.ts` | Baixo | Removido |
| `apps/web/src/app/api/frota/*` | 5 rotas | **A** | `vehicle-gateway.ts`, `device-auth.ts` | Baixo | Removido |
| `apps/web/src/app/(app)/frota/*` | 3 páginas + 5 componentes | **A** | permissões `frota.*` | Baixo | Removido |
| `frota.view`/`frota.manage` | `permissions.ts` | **A** | link de menu, `DEFAULT_ROLES` (só via spread do Administrador) | Baixo | Removido |
| Link "Frota" no menu | `layout.tsx` | **A** (consequência) | `hasPermission(ctx,"frota.view")` | Baixo | Removido |
| `DEVICE_AUTH_PATH_PREFIXES` | `middleware.ts` | **A** (consequência) | rotas `/api/vehicle/*` (já removidas) | Baixo | Removido |
| Migrations `20260910133144_kerocar_vehicle_domain` / `..._enable_rls_kerocar_vehicle` | `prisma/migrations/` | **D** — legado histórico | histórico de schema | N/A — migrations passadas nunca são editadas | **Preservadas** intactas; nova migration de DROP criada por cima |
| 13 arquivos de teste (`vehicle-*`, `device-auth`, `kerocar-vehicle-isolation`, `security-event-ingest`) | `apps/web/tests/`, `packages/db/tests/` | **A** | testavam exatamente o código removido acima | Nenhum (testariam código inexistente) | Removidos |
| `rls.sql` — bloco de policy do domínio de veículo | `prisma/rls.sql` | **A** (documentação órfã) | — | Nenhum | Substituído por nota |
| README.md — seção "KeroCar Intelligence" | `README.md` | **A** (documentação órfã) | — | Nenhum | Substituída por nota de remoção |
| `KEROCAR-DOMINIO-VEICULO.md` | raiz do repo | **A** (documentação órfã) | `README.md` (linha removida) | Nenhum | Movido para `_removido-kerocar/` |
| **Tenant Core** (`tenant-db.ts`, `current_tenant_id()`/`rls_bypass()`) | `packages/db/src/tenant-db.ts` | **B** — módulo genérico KeroMind | TODO o domínio Partiu (Lead, Gate, CostEvent, Job...) — também era usado pelo KeroCar | Não removível | **Preservado** |
| Gates/Audit/SecretProvider/Cost Control/Tool Broker/Job Engine | `packages/db/src/{gates,audit,secret-provider,cost-control,tools,jobs}` | **B** | Todo o domínio Partiu | Não removível | **Preservado** |
| `Tenant`/`User`/`Membership`/`Role`/`Permission` (base) | `schema.prisma` | **B** | Todo o app | Não removível | **Preservado** |
| Menções em `PLANO-MESTRE-EXECUCAO.md`, `PERGUNTAS-ABERTAS.md`, `RELATORIO-FECHAMENTO-{T1,T2,T3,T5,T5-FIX,PM-BLOQ-001}.md` | raiz do repo | **D** — histórico | — | N/A | **Preservadas sem alteração** (registro do que foi decidido/feito em cada rodada; não se reescreve histórico) |

Nenhum item foi classificado como **C** (dependência real do Partiu) nem como **D — legado/órfão a avaliar** além dos dois casos explicitamente marcados acima (migrations antigas e documentos históricos) — não havia zona cinzenta: tudo sob o domínio de veículo era exclusivamente KeroCar (A), e tudo que o Partiu de fato usa (RLS, Gates, Audit, SecretProvider, Cost Control, Tool Broker, Job Engine) é infraestrutura genérica KeroMind (B), sem nenhuma mistura de domínio entre os dois.

## 3. O que é KeroCar exclusivo?

Tudo listado como **A** na tabela acima — o domínio funcional completo de telemetria/diagnóstico veicular (models, rotas, telas, permissões, autenticação de dispositivo).

## 4. O que é KeroMind compartilhável?

Tenant Core/RLS, Auth/RBAC, Gates+Audit (T1), SecretProvider (PM-BLOQ-001), Cost Control (T2), Tool Broker (T3), Job/Execution Engine (T5) — nenhum desses tem qualquer acoplamento com conceitos automotivos; continuam exatamente como estavam.

## 5. O que o Partiu realmente utiliza?

CRM (Contact/Lead/Pipeline/Stage/Conversation/Message/Note/Task), WhatsApp Cloud API, Yalla (Tool Broker Camadas 1/2), captura pública de lead, e toda a infraestrutura B listada acima. Zero dependência de qualquer item A.

## 6. Houve remoção?

Sim.

## 7. Se houve, exatamente o que foi removido?

- 6 models Prisma + 5 enums (`DeviceStatus`, `TelemetryQuality`, `DtcStatus`, `SecurityEventType`, `SecurityEventSeverity`) + 6 tabelas no banco.
- 2 módulos de `packages/db/src` (`vehicle-gateway.ts`, `device-auth.ts`).
- 8 rotas de API (`/api/vehicle/*` ×3, `/api/frota/*` ×5).
- 3 páginas + 5 componentes (`/frota`, `/frota/novo`, `/frota/[id]` e seus formulários).
- 2 chaves de permissão (`frota.view`, `frota.manage`) e o link "Frota" do menu.
- 1 carve-out de middleware (`DEVICE_AUTH_PATH_PREFIXES`, órfão sem as rotas que protegia).
- 13 arquivos de teste que testavam exatamente esse código.
- Documentação órfã (seção do README, `KEROCAR-DOMINIO-VEICULO.md` movido, bloco do `rls.sql`).

## 8. Algum dado/schema/migration foi afetado?

Schema: sim, 6 tabelas + 5 enums dropados via migration nova (`20260915000000_remove_kerocar_domain`), aplicada e verificada. Dado: **nenhum** — as 6 tabelas foram confirmadas com **0 linhas** antes do DROP (consulta direta ao banco, não suposição). Migrations antigas (`20260910133144_kerocar_vehicle_domain`, `..._enable_rls_kerocar_vehicle`) foram preservadas intactas — nunca se edita uma migration já aplicada; a remoção é uma migration nova por cima, como manda o Prisma.

## 9. Existe risco de regressão?

Nenhum encontrado. Typecheck limpo nos dois pacotes, build de produção limpo (16 rotas, antes 22 — exatamente as 6 páginas/rotas de KeroCar removidas), regressão completa 268/268 passando (ver seção 19-22).

## 10. O KeroCar ficou totalmente desacoplado do domínio Partiu?

Sim. Confirmado por busca direta no código (não suposição): zero ocorrências de `vehicle-gateway`, `device-auth`, `frota.view`/`frota.manage`, `/api/vehicle`, `/api/frota` em qualquer arquivo `.ts`/`.tsx` de `apps/web/src`, `packages/db/src`, ou nas suítes de teste restantes. O Job Engine (T5) tem exatamente um tipo de job registrado (`whatsapp.enviar_mensagem`) — nenhum vinculado a veículo/dispositivo.

## 11. Se não, o que falta?

N/A — desacoplamento confirmado completo.

## 12. O formulário público continua persistindo o lead antes do WhatsApp?

Sim — `apps/web/tests/integration/public-leads-route.test.ts` (9 testes, incluindo os 2 de CORS adicionados na rodada anterior) passou integralmente nesta regressão. O fluxo `POST /api/public/leads` → `Contact`/`Lead`/`Note` → só depois WhatsApp não foi tocado por esta rodada (nenhuma mudança de KeroCar tocou esse caminho) e continua coberto por teste real, não mock de UI.

## 13. Site/admin continuam seguros?

Sim — nenhum arquivo de `site-original/` foi tocado nesta rodada (a remoção do KeroCar é inteiramente dentro do monorepo `apps/web`/`packages/db`; o site público é um projeto à parte). As correções da rodada anterior (senha fora do código, rate limit, SVG fora do allowlist, `.htaccess`, ZIP de trabalho fora da pasta de deploy) continuam no lugar — confirmado por inspeção dos arquivos, sem necessidade de reteste porque nada nesta rodada poderia tê-los afetado.

## 14. Qual o estado real do WhatsApp?

**IMPLEMENTADO E TESTADO LOCALMENTE.** Webhook com verificação HMAC, dedup real (`@@unique` em `externalId`), envio via Job Engine com retry/backoff (`whatsapp.enviar_mensagem`), integração com Yalla — tudo coberto por testes com `fetch` mockado. **Não há ambiente/credencial WABA real disponível nesta sessão** — nenhuma chamada real foi feita, nenhum resultado foi inventado.

## 15. WABA foi validado de verdade ou somente localmente?

**Somente localmente.** Bloqueador repetido em três documentos diferentes (auditoria original, plano mestre, handoff) — segue como decisão externa pendente do fundador (conta WABA real de teste).

## 16. Yalla F1 continua funcionando?

Sim — `packages/db/tests/integration/tool-broker.test.ts` e `apps/web/tests/integration/yalla-tool-calling.test.ts` passaram integralmente nesta regressão, sem nenhuma alteração de código nesta rodada em `packages/db/src/tools/` ou `apps/web/src/lib/ai/`. Nenhuma tool nova foi criada, nenhuma autonomia foi ampliada (proibido explicitamente nesta rodada, e não feito).

## 17. Tool Broker/Gates/Audit/Cost Control continuam funcionando?

Sim — todas as suítes correspondentes (`gates-isolation`, `tool-broker`, `cost-control` ×2, `secret-provider`) passaram integralmente, sem alteração de código nesta rodada.

## 18. Job Engine continua íntegro?

Sim — `job-engine.test.ts` (40 testes: claim atômico, lease/heartbeat/fencing, retry/backoff, dead-letter, teste de carga 100 jobs) e `job-whatsapp-resend.test.ts` (5 testes, incluindo timeout real via `AbortSignal`) passaram integralmente. T5 não foi reconstruído nem tocado — só verificado.

## 19. Quantos testes existiam antes?

355 (228 em `packages/db` + 127 em `apps/web`), conforme o Relatório de Reconciliação anterior.

## 20. Quantos existem agora?

268 (186 em `packages/db` + 82 em `apps/web`). A redução de 87 testes é **esperada e correta** — são exatamente os testes que existiam só para cobrir o código KeroCar removido (13 arquivos de teste, listados na seção 2), não uma perda de cobertura do domínio Partiu.

## 21. Quantos passaram?

**268 de 268.**

## 22. Quantos falharam?

**0.**

## 23. Typecheck?

Limpo nos dois pacotes (`tsc --noEmit`, 0 erros) — corrigido um erro real no caminho: um arquivo de teste (`security-event-ingest.test.ts`) que meu mapeamento inicial não tinha pego referenciava o módulo removido; encontrado pelo próprio typecheck falhando, não escondido, removido junto.

## 24. Build?

Limpo. `next build`, exit code 0, **16 rotas** (antes 22 — exatamente as 6 rotas/páginas de KeroCar a menos).

## 25. Migrations?

24 migrations, todas aplicadas, banco em dia (`prisma migrate status` → "Database schema is up to date!"). A migration de remoção (`20260915000000_remove_kerocar_domain`) está documentada com o motivo da remoção e a confirmação de 0 linhas antes do DROP.

## 26. Git status?

Repositório **continua sem inicialização Git** (`fatal: not a git repository`) — confirmado nesta rodada, nenhuma mudança. `git init` não foi executado.

## 27. Quais dependências externas continuam pendentes?

Mesmas do Relatório de Reconciliação, sem mudança: WABA real, GA4/Search Console/Ads/Meta, ElevenLabs, vendor de produção do SecretProvider, domínio real de produção do site (`PUBLIC_SITE_ORIGIN`), preços reais em `ModelPrice`.

## 28. Quais decisões (*) ainda dependem do fundador?

Mesma lista do Relatório de Reconciliação (horário humano, política de voz, área do viajante V1, regras fiscais por país, autorização de T4, domínio de produção do site, conta WABA real, vendor do SecretProvider, preços de `ModelPrice`) — **uma resolvida nesta rodada**: KeroCar extrair ou manter compartilhado → **extraído/removido**, conforme autorização explícita recebida.

## 29. A F1 pode ser considerada tecnicamente fechada?

**Tecnicamente sim, dentro do que não depende de credencial externa.** Todo o caminho testável localmente (captura de lead → CRM, WhatsApp Cloud API com fetch mockado, Yalla Camadas 1/2, Gates/Audit/Cost Control/SecretProvider/Tool Broker/Job Engine, RLS multi-tenant, segurança do site/admin) está implementado, testado e passando. O único item que impede declarar F1 *definitivamente* pronta para produção é a validação contra uma conta WABA real — que é uma dependência externa (decisão/acesso do fundador), não uma lacuna de código.

## 30. Qual deve ser o próximo bloco?

Mesma recomendação do Relatório de Reconciliação, sem mudança de prioridade: **validar WhatsApp contra WABA real** primeiro (fecha F1 de verdade), depois **T6 — Attribution** (UTM/gclid/fbclid, pré-requisito pequeno e bem definido para todo o capítulo de Marketing). T4 (Model Router) e F2-F6 seguem explicitamente não iniciados, aguardando autorização.

---

## Definição de DONE — checklist

- [x] Estado KeroCar claramente mapeado (matriz completa, seção 2)
- [x] Nenhuma remoção insegura foi realizada (tabelas confirmadas vazias antes do DROP)
- [x] Separação segura foi feita (KeroCar totalmente desacoplado, seção 10)
- [x] Domínio Partiu permanece íntegro (regressão 268/268)
- [x] Site → CRM → WhatsApp continua funcional (seção 12)
- [x] Segurança do admin/site permanece correta (seção 13)
- [x] Yalla permanece funcional (seção 16)
- [x] Gates/Audit/Cost Control/Tool Broker permanecem íntegros (seção 17)
- [x] T5 permanece íntegro (seção 18)
- [x] RLS permanece íntegro (testes de isolamento multi-tenant passando em todas as suítes restantes)
- [x] Regressão completa passou (268/268)
- [x] Build/typecheck limpos
- [x] Relatório de fechamento produzido (este documento)

**VEREDITO: PM-SANEAMENTO-01 CONCLUÍDO.**

---

PARAR. NÃO iniciar T6. NÃO iniciar T4. NÃO iniciar F2. NÃO iniciar qualquer outra fase. Aguardando autorização explícita do fundador.
