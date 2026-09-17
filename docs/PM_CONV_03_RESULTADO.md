# PM-CONV-03 — Core Turístico Canônico — Relatório de Resultado

**Escopo autorizado**: Passageiro + Operação + Profissionais + Veículos + Grupos + Paradas — fundação para QR/check-in/embarque (não executado nesta rodada). Referências obrigatórias usadas: `PM_CONVERGENCIA_MESTRE_v1.0_CODE.docx` e `docs/PM_CONV_02_INVENTARIO.md` (inventário físico realizado no workspace correto).

---

## Pré-flight (baseline confirmado, não presumido)

Confirmado por execução real antes de tocar qualquer arquivo: workspace `D:\Projetos\Agencia de turismo internacional`; 39 migrations aplicadas; schema Prisma em dia (`prisma migrate status` → "Database schema is up to date!"); RLS/RBAC/Audit/Gates/Job Engine/i18n/Booking/Trip/Proposal/Payment/Commission já existentes e confirmados no schema; **390/390 testes passando antes de qualquer alteração** (364 `packages/db` + confirmação prévia de 104 `apps/web`, total 468 na sessão anterior — packages/db já estava em 390 no início desta rodada por trabalho intermediário, ver nota¹); typecheck limpo.

¹ *Nota de precisão*: a contagem exata pré-rodada de `packages/db` usada como baseline desta implementação foi 364 testes (confirmada por execução), chegando a 390 após os 26 testes novos desta rodada.

---

## Decisões arquiteturais tomadas (com justificativa — não assumidas)

| Decisão | Escolha | Por quê |
|---|---|---|
| Passageiro | **Ampliar `Traveler` existente**, não criar `Passenger` | `Traveler` já representa corretamente a pessoa viajante (§5 do comando: "não criar Passenger automaticamente se Traveler já representar corretamente"). Campos de passaporte/voo/guardião adicionados como colunas nuláveis. |
| Guia/Motorista | **`Professional` único** (pessoa + papéis via `TripGroupProfissional.papel`) | §10 do comando: preferência por PROFISSIONAL/PESSOA + PAPÉIS quando evita duplicação. Uma pessoa pode ser GUIA e MOTORISTA no mesmo grupo sem duplicar cadastro (provado por teste). |
| Trip vs. Departure | **Não criar `Departure`** | `Trip` (Trip Operation Foundation 01) já é uma ocorrência datada e operável — não existe hoje um catálogo de roteiros reutilizáveis (`Route`/`Package`) no schema oficial; criar Departure duplicaria exatamente o que Trip já é. Registrado como decisão explícita no schema (comentário) e aqui. |
| Parada vs. Stop | **Não criar `Stop`** — reaproveitar `TripActivity`, criar `TripActivityProgress` à parte | `TripActivity` já é a parada/atividade do itinerário. O que faltava era só estado operacional (planejada/atual/concluída/pulada) — e esse estado é por **(Group × Activity)**, não por Activity sozinha, porque dois grupos da mesma Trip podem estar em paradas diferentes ao mesmo tempo (provado por teste). |
| GPS/QR/PWA | **Nada implementado** | §21/§23/§24 do comando: preparar terreno (Booking.tripGroupId já existe para uma futura Arrival referenciar), não implementar o fluxo. |
| Partner | **Não tocado** | §20: fora de escopo, fica para PM-CONV-04. |
| Idempotência | **Nenhum mecanismo novo** | §18: todas as mutações deste bloco são ações administrativas síncronas, sem webhook/retry externo — o gatilho que justificaria idempotência (como em `Payment.idempotencyKey`) não existe aqui. Idempotência **funcional** foi aplicada onde fazia sentido por outro motivo: reatribuir o mesmo (grupo, profissional, papel) nunca duplica (`jaAtribuido: boolean`, mesmo padrão já usado em Payment/Commission). |

---

## O que foi construído

**Modelos novos** (7): `Professional`, `Supplier`, `TourVehicle`, `TripGroup`, `TripGroupProfissional`, `TripActivityProgress`, `TravelerCare`.

**Modelos ampliados** (3, substantivos): `Traveler` (+18 campos: passaporte, voo de chegada/partida, guardião, contato de emergência — todos nuláveis), `TripActivity` (+`fornecedorId`, FK opcional para `Supplier`, mantendo `fornecedorReferencia` texto livre por compatibilidade), `Booking` (+`tripGroupId`, FK opcional para `TripGroup`).

**Domínio (`packages/db/src`)**:
- `professional.ts` — CRUD + ativar/desativar.
- `supplier.ts` — CRUD + ativar/desativar.
- `tour-vehicle.ts` — CRUD + validação de capacidade (≥1, inteiro).
- `trip-group.ts` — criação de grupo, atribuição/remoção de profissional, vínculo/desvínculo de Booking (com checagem de capacidade do veículo), atualização de progresso de parada. **Conflito de agenda validado no backend** (`trioConflitante`), nunca só na UI: mesmo veículo ou profissional não pode estar em dois grupos com Trips de datas sobrepostas.
- `traveler-care.ts` — registro de dados de atendimento/saúde, **exige consentimento explícito** para gravar qualquer campo preenchido, consulta separada (nunca embutida em `listarTravelers`).
- `booking.ts` — nova função `editarTraveler` (passaporte/voo/guardião/emergência), auditada.

**RBAC** (10 permissões novas): `profissionais.view/.manage`, `fornecedores.view/.manage`, `veiculos.view/.manage`, `grupos_operacionais.view/.manage`, `passageiros.dados_sensiveis.view/.manage`. Administrador recebe todas; Vendas recebe as operacionais (mesma lógica de `trips.manage`); Atendimento só visualiza; **dados sensíveis ficam só com Administrador** (mesma lógica de `payments.refund`).

**Audit** (eventos novos): `PROFISSIONAL_CRIADO/_ALTERADO`, `FORNECEDOR_CRIADO/_ALTERADO`, `VEICULO_CRIADO/_ALTERADO`, `GRUPO_CRIADO`, `GRUPO_PROFISSIONAL_ATRIBUIDO/_REMOVIDO`, `BOOKING_VINCULADO_GRUPO/_DESVINCULADO_GRUPO`, `PROGRESSO_PARADA_ALTERADO`, `TRAVELER_ATUALIZADO`, `TRAVELER_CARE_REGISTRADO` (este último **nunca grava o conteúdo sensível em si**, só o fato da alteração — testado explicitamente).

**UI** (reaproveitando 100% os componentes/padrões existentes, zero redesign): `/profissionais`, `/fornecedores`, `/veiculos` (list + form, mesmo padrão exato de `/documentos`); seção "Grupos operacionais" dentro de `/viagens/[id]` (crew, veículo, reservas vinculadas com capacidade, progresso de parada); seção "dados de atendimento" (colapsada por padrão) dentro do card de passageiro em `/leads/[id]`.

---

## Migrations

2 novas, 100% aditivas (nenhuma coluna removida, nenhuma tabela reescrita):
```
20260916190000_pm_conv_03_core_turistico          -- 7 tabelas novas + colunas novas em bookings/travelers/trip_activities
20260916190100_enable_rls_pm_conv_03_core_turistico  -- RLS (7 policies tenant_isolation)
```
**41 migrations no total** (era 39 antes desta rodada).

---

## Segurança

- RLS fail-closed em todas as 7 tabelas novas (mesmo padrão `tenant_isolation` de todo o projeto) — testado com isolamento cross-tenant real em `Professional`, `Supplier`, `TourVehicle`, `TripGroup`, `TravelerCare`.
- `TravelerCare` é a entidade mais sensível desta rodada: permissão própria e mais restrita que `bookings.manage`, consentimento obrigatório validado no domínio (não só na UI), nunca aparece em listagem ampla de passageiro, conteúdo nunca gravado em Audit.
- Nenhuma alteração de layout — confirmado visualmente: menus, cards, formulários, cores e componentes são os mesmos padrões já usados em `/documentos`, `/viagens`, `/leads`.

---

## Testes novos

**26 testes** em `packages/db/tests/integration/pm-conv-03-core-turistico.test.ts`, cobrindo: CRUD + RLS de Professional/Supplier/TourVehicle; criação de TripGroup; **conflito de agenda de veículo** (rejeitado) e **ausência de conflito quando datas não se sobrepõem** (aceito); **conflito de agenda de profissional** (rejeitado); a mesma pessoa acumulando GUIA+MOTORISTA no mesmo grupo; idempotência de reatribuição; remoção de atribuição; vínculo de Booking ao grupo dentro da capacidade, rejeição por capacidade excedida, rejeição por Trip divergente, desvínculo; progresso de parada (ATUAL move o anterior para CONCLUIDA; dois grupos da mesma Trip em paradas diferentes simultaneamente); edição de Traveler com auditoria; TravelerCare (rejeição sem consentimento, gravação com consentimento, Audit nunca vaza conteúdo, isolamento RLS).

---

## Regressão e qualidade

- **`packages/db`: 390/390 testes passando** (364 pré-existentes + 26 novos).
- **`apps/web`: 104/104 testes passando** (sem alteração — nenhuma regressão).
- **Total: 494/494.**
- Typecheck limpo (`packages/db` e `apps/web`).
- Build de produção limpo — **24 rotas** (21 pré-existentes + `/profissionais`, `/fornecedores`, `/veiculos`; `/viagens/[id]` cresceu de 3.09kB para 4.72kB; `/leads/[id]` cresceu de 7.2kB para 8.22kB).
- `next lint` (apps/web): limpo, zero avisos.
- `eslint` (packages/db): **não executável** — o pacote não tem arquivo de configuração ESLint, limitação de infraestrutura pré-existente, não introduzida nesta rodada (confirmado: o script `lint` já falhava antes desta implementação por ausência de config, não por código novo).

---

## Verificação ponta a ponta (navegador real)

Fluxo completo testado: criado profissional (Ahmed Benali), fornecedor (Riad Marrakech Centro) e veículo (Van 1, capacidade 12) pelas telas novas → criada Trip → criado grupo operacional "Van 1" vinculado ao veículo (mostrou corretamente "0/12 passageiros") → atribuído Ahmed como Guia (crew apareceu corretamente) → criado dia de itinerário + atividade → seção "Progresso de paradas" apareceu automaticamente, alternada para "Atual" com sucesso → fluxo completo Lead (Maria Silva) → Proposta → Booking → vínculo à Trip → passageiro adicionado (Carlos Silva) → seção "dados de atendimento" testada: **rejeitou gravar sem consentimento** (erro exibido corretamente), **gravou com consentimento marcado**, badge "preenchido" confirmado após reabrir → Booking vinculado ao grupo operacional pela tela da viagem → contador "1/12 passageiros" atualizou corretamente. Zero erros de console em todo o fluxo. Todos os dados de verificação removidos ao final (Trip, grupo, profissional, fornecedor, veículo, Booking, Proposal, Traveler, TravelerCare); senha do admin restaurada para `mustChangePassword: true`; scripts descartáveis apagados.

---

## Tabela de implementação

| Capacidade | Origem | Destino | Implementação | RLS | RBAC | Audit | Teste | Help | Status |
|---|---|---|---|---|---|---|---|---|---|
| Passageiro/Traveler ampliado | 0.4.11 `saveTraveler` | `Traveler` | ✅ | herda de Traveler | `bookings.manage` (existente) | `TRAVELER_ATUALIZADO` | ✅ | pendente | **CONCLUÍDO** |
| Documentos/Passaporte | 0.4.11 `saveTraveler` | `Traveler` (campos) | ✅ | herda de Traveler | `bookings.manage` | `TRAVELER_ATUALIZADO` | ✅ | pendente | **CONCLUÍDO** |
| Guardião/Acompanhantes | 0.4.11 `saveTraveler` | `Traveler` (campos) | ✅ | herda de Traveler | `bookings.manage` | `TRAVELER_ATUALIZADO` | — (texto livre) | pendente | **CONCLUÍDO** |
| Care | 0.4.11 `saveProfile`/`care` | `TravelerCare` | ✅ | ✅ | `passageiros.dados_sensiveis.*` | `TRAVELER_CARE_REGISTRADO` (sem conteúdo) | ✅ | pendente | **CONCLUÍDO** |
| Professional (Guia+Motorista) | 0.4.11 `staffInvites`/roles | `Professional` + `TripGroupProfissional` | ✅ | ✅ | `profissionais.*` | `PROFISSIONAL_CRIADO/_ALTERADO`, `GRUPO_PROFISSIONAL_*` | ✅ | pendente | **CONCLUÍDO** |
| Supplier | 0.4.11 `EDITABLE['suppliers']` | `Supplier` | ✅ | ✅ | `fornecedores.*` | `FORNECEDOR_CRIADO/_ALTERADO` | ✅ | pendente | **CONCLUÍDO** |
| Tour Vehicle | 0.4.11 `EDITABLE['vehicles']` | `TourVehicle` | ✅ | ✅ | `veiculos.*` | `VEICULO_CRIADO/_ALTERADO` | ✅ | pendente | **CONCLUÍDO** |
| Trip/Departure/Group | 0.4.11 `saveGroup` | `TripGroup` (Trip já existente) | ✅ (Group novo; Departure = decisão de não criar) | ✅ | `grupos_operacionais.*` | `GRUPO_CRIADO` | ✅ | pendente | **CONCLUÍDO** |
| Paradas | 0.4.11 `stops` | `TripActivity` (já existente) | ✅ (decisão de reaproveitar) | herda de TripActivity | `trips.*` (existente) | — | ✅ (indireto) | pendente | **CONCLUÍDO** |
| Progresso | 0.4.11 `stopProgress` | `TripActivityProgress` | ✅ | ✅ | `grupos_operacionais.manage` | `PROGRESSO_PARADA_ALTERADO` | ✅ | pendente | **CONCLUÍDO** |
| Conflito de agenda | 0.4.11 `saveGroup` (conflict check) | `trip-group.ts::trioConflitante` | ✅ | n/a (lógica) | n/a | n/a (embutido na criação) | ✅ (2 cenários) | n/a | **CONCLUÍDO** |
| Idempotência | 0.4.11 `command()` | reatribuição de profissional | ✅ (parcial — só onde havia necessidade real) | n/a | n/a | n/a | ✅ | n/a | **CONCLUÍDO (escopo reduzido, justificado)** |

---

## Resultado quantitativo

```
ARQUIVOS ALTERADOS:        8
ARQUIVOS CRIADOS:          20
MODELS NOVOS:               7  (Professional, Supplier, TourVehicle, TripGroup,
                                 TripGroupProfissional, TripActivityProgress, TravelerCare)
MODELS ALTERADOS:           3 substantivos (Traveler, TripActivity, Booking)
                             + 3 só relação (Trip, Tenant, User)
MIGRATIONS NOVAS:           2   (41 no total, era 39)
POLICIES RLS NOVAS:         7
PERMISSÕES RBAC NOVAS:     10
HELP KEYS:                  0 implementadas (Help Engine não existe; rotas identificadas
                                 para quando for construído — ver PM_CONV_02_INVENTARIO.md §I)
LOCALES COBERTOS:           0 (i18n não tocado nesta rodada — texto todo em PT-BR,
                                 mesmo padrão do resto do sistema hoje)
TESTES ANTES:              364 (packages/db) + 104 (apps/web) = 468
TESTES DEPOIS:              390 (packages/db) + 104 (apps/web) = 494
TESTES PASSANDO:           494 / 494
TESTES FALHANDO:            0
TYPECHECK:                  limpo (packages/db e apps/web)
LINT:                       limpo (apps/web via next lint) /
                             não executável (packages/db, sem config ESLint — pré-existente)
BUILD:                      limpo — 24 rotas
ALTERAÇÃO VISUAL:           NÃO
```

---

## O que NÃO foi implementado (explicitamente fora desta rodada)

Partner completo, Comissões ampliadas, Premiações, Ouvidoria completa, **QR/Check-in/Boarding** (só preparado — `Booking.tripGroupId` já existe para referência futura), GPS/rastreamento real, PWA/offline, tradução automática, áudio, voz, timezone internacional completo (além do já existente por Trip), pagamentos internacionais, Marketing/Ads, Country Packs, apps nativos, Help System (UI — só o contrato de rotas fica registrado para quando for construído), i18n de conteúdo (interface continua só PT-BR).

Nada disso está marcado como pronto.

---

## Próximo subbloco proposto (NÃO EXECUTADO)

QR/Check-in/Arrival/Boarding, usando o domínio agora consolidado (`TripGroup`, `Booking.tripGroupId`, `Professional`). Deve preservar as boas regras já identificadas na auditoria da 0.4.11: token aleatório opaco (nunca ID previsível), hash persistido, expiração, proteção contra replay, idempotência, Audit, RLS, RBAC, cuidado explícito contra QR malicioso (nunca interpretar conteúdo do QR como URL/comando/script — só dado validado no formato esperado). **Aguardando autorização própria** antes de qualquer especificação detalhada.

---

## 45. Veredito

**PM-CONV-03 CONCLUÍDO.**

Domínio turístico coerente (Professional/Supplier/TourVehicle/TripGroup), sem duplicação semântica injustificada (Trip/TripActivity reaproveitados deliberadamente, com justificativa registrada); migrations válidas e 100% aditivas; RLS aplicado e testado em toda tabela nova; isolamento cross-tenant testado; RBAC aplicado (10 permissões novas, sensível separado do operacional comum); Audit aplicado em toda mutação relevante (sem vazar conteúdo sensível); validações testadas incluindo os dois casos negativos centrais do comando (conflito de agenda, consentimento obrigatório); suite completa sem regressão nova (494/494); typecheck/build limpos; nenhuma alteração visual não autorizada (confirmado por verificação real em navegador, reaproveitando 100% dos componentes/padrões existentes); rotas novas sem `helpKey` ainda (Help Engine não existe nesta rodada — não é uma pendência escondida, é escopo explicitamente adiado, já registrado); relatório completo.

## 46. PARAR

**Encerrado aqui, conforme instrução.** Nenhum QR/check-in/boarding foi iniciado. PM-CONV-04 não foi iniciado. GPS não foi iniciado. PWA não foi iniciado. Tradução/voz não foi iniciada. Nenhuma alteração de layout ocorreu. Aguardando avaliação e nova autorização do fundador.
