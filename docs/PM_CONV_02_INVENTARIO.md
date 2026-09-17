# PM-CONV-02 — Inventário Físico, Rastreabilidade e Congelamento da Convergência

**Modo: AUDITORIA / INVENTÁRIO / RASTREABILIDADE / PLANEJAMENTO. Nada foi implementado, alterado, migrado ou commitado nesta rodada.**

Referência obrigatória usada: `PM_CONVERGENCIA_MESTRE_v1.0_CODE.docx` (lido integralmente). Decisão arquitetural já tomada nesse documento — **não rediscutida aqui**: a fundação oficial (Next.js/TypeScript + PostgreSQL/Prisma + Tenant Core/RLS) permanece; PHP/Firebase/Firestore da entrega 0.4.11 nunca substituem essa fundação; nenhuma alteração de layout é autorizada.

---

## 0. Metodologia desta auditoria

Todo o código não-vendor da entrega 0.4.11 foi **lido integralmente** por mim nesta sessão (16 arquivos PHP do backend, 794 linhas; o roteador, service worker e principais módulos JS do frontend; `firestore.rules`; `firestore.indexes.json`) — não apenas indexado por nome. A documentação do Valter (README, manual operacional de 2976 linhas, reconstrução completa de 4189 linhas) foi consultada para o "declarado", mas — conforme a regra explícita do comando ("documentação não é prova de implementação") — toda afirmação relevante abaixo está ancorada em código real, com caminho de arquivo. Onde a documentação do Valter diverge do código, o código prevalece e a divergência é registrada.

---

## A. Inventário do repositório oficial atual

| Item | Valor |
|---|---|
| Caminho absoluto | `D:\Projetos\Agencia de turismo internacional` |
| Stack | Next.js 14 (App Router) + TypeScript, PostgreSQL + Prisma, pnpm workspace |
| Estrutura | `apps/web` (Next.js), `packages/db` (Prisma + domínio) |
| Modelos Prisma | 42 |
| Migrations aplicadas | 39, 100% aditivas, nenhuma destrutiva |
| Arquivos `.ts` em `packages/db/src` (exclui scripts descartáveis) | 48 |
| Arquivos `.ts`/`.tsx` em `apps/web/src` | 93 |
| Testes automatizados | 468 (364 `packages/db` + 104 `apps/web`), todos passando na verificação mais recente desta sessão |
| Rotas finais (`apps/web`) | 21 |
| Git | **não inicializado** neste repositório — confirmado, não presumido |
| RLS | Fail-closed em toda tabela `tenant_id`, via `withTenant`/`withSystem` + `FORCE ROW LEVEL SECURITY` |
| Auth | Sessão por cookie httpOnly, e-mail/senha (bcrypt), troca de senha obrigatória no primeiro acesso |
| RBAC | `Role`/`Permission`/`RolePermission` configurável por tenant |

Módulos de domínio já existentes (arquivo real, não por memória — listados via `packages/db/src/`): `attribution.ts`, `audit.ts`, `booking.ts`, `commercial-policy.ts`, `commission.ts`, `cost-control.ts`, `cross-tenant.ts`, `gates.ts`, `payment.ts`, `permissions.ts`, `proposals.ts`, `receivables.ts`, `secret-provider.ts`, `tenant-db.ts`, `travel-documents.ts`, `trip.ts`, mais `crm/` (lead-scoring, next-best-action, proposta-politica, atividade), `finance/` (contratos + country-pack-registry), `i18n/` (locales, format), `jobs/` (engine, registry, backoff), `tools/` (broker, registry, grants, definitions).

**Confirmado por grep no schema**: não existe hoje nenhum model `Partner`, `Guide`, `Driver`, `Vehicle`, `SupportTicket`, `Review` ou `QrToken`/`ArrivalSession` no sistema oficial — todos esses domínios, presentes na 0.4.11, são candidatos de importação avaliados abaixo.

---

## B. Inventário físico da entrega 0.4.11 (Valter)

**Caminho de origem**: `C:\Users\henri\Downloads\partiumarrocos.com.br-php74-0.4.11.zip` (9.814.413 bytes). Extraído para auditoria em `<scratchpad>/pm-conv-02/codigo-0.4.11/` — **não copiado para dentro do repositório oficial**, conforme regra bloqueante nº 3.

Documentação relacionada: `C:\Users\henri\Downloads\DOCUMENTACAO-COMPLETA-PARTIU-MARROCOS-0.4.11 comppleta` (45.903.131 bytes) — pacote com manual navegável, manual operacional (PDF/MD), reconstrução completa e um snapshot de 739 arquivos-fonte para reprodução (`FONTES-REPRODUCAO-0.4.11.zip`, não extraído nesta rodada — redundante com o pacote de código já auditado).

### Totais

| Categoria | Qtd. |
|---|---|
| Arquivos totais no ZIP de código | 267 |
| Arquivos PHP (inclui vendor/Composer) | 176 |
| Arquivos PHP de domínio próprio (`_private/src/*.php`) | 16 |
| Arquivos JS de frontend | 22 |
| Imagens (`.jpg`/`.png`/`.svg`) | 32 |
| Documentos Markdown internos (`_private/*.md`) | 4 |
| Firestore rules/indexes | 2 |
| Manifesto PWA | 1 |

### B. Separação por categoria (item 5 do comando)

| Categoria | Conteúdo | Status |
|---|---|---|
| **A. Documentação** | `_private/README.md`, `COMPATIBILIDADE-74.md`, `INSTALACAO.md`, `SITE-RENOVADO.md`, `VALIDACAO.md`, `RELEASE.json` + pacote externo de 45 MB (manual PDF/HTML/MD) | presente, extensa |
| **B. Backend** | 16 arquivos `_private/src/*.php` (ver Tabela B) | real, lido integralmente |
| **C. Frontend** | `app/*.js` (SPA/PWA), `app/*.css`, `app/index.html` | real |
| **D. Firebase/Firestore** | `firestore.rules` (nega tudo ao cliente — ver §H), `firestore.indexes.json` (vazio — sem índices compostos, list() completo filtrado em PHP) | real, com limitação de escala |
| **E. Auth** | `Firebase.php` (`FirebaseAuth`, `GoogleCredentials`) — login exclusivamente via Google OAuth (`sign_in_provider==='google.com'`), sem e-mail/senha | real |
| **F. Regras de negócio** | Distribuídas em `Bookings.php`, `Operations.php`, `Services.php`, `Experience.php` (ver Tabela B) | real, densa |
| **G. Integrações** | Stripe (`Payments.php`), e-mail (SMTP/Resend/Webhook, `Email.php`), Firestore REST (`Firebase.php`) | real, ver status por integração em §27 |
| **H. Testes** | **Nenhum arquivo de teste automatizado encontrado** no pacote de código (`*test*`, `*spec*` — zero ocorrências) | **ausente** |
| **I. PWA/Offline** | `app/sw.js`, `app/offline.js`, `app/offline-mode.js`, `app/manifest.webmanifest` | real, simples |
| **J. Assets** | 28 imagens de destino/cenário, `logo.png`, `icon.svg`, `geo.json`, `roads.json` | reaproveitável como conteúdo, não como camada de dados |
| **K. Scripts/build/deploy** | `_private/bin/console.php` (CLI: `check-config`, `bootstrap`, `import-catalog`, `worker`, `verify-email`, `verify-firebase`) | real |
| **L. Dados/seeds/fixtures** | `_private/starter-catalog.json`, `_private/manual-data.json` | presente |
| **M. Configuração** | `_private/config.example.php`, `.htaccess` (raiz e `_private/`) | presente, sem segredo comitado (confirmado — ver §31) |
| **N. Outros** | `_private/composer.json`/`.lock` (Composer: `phpmailer/phpmailer`, `bacon/bacon-qr-code`, `dasprid/enum`) | vendor de terceiros, licenças presentes |

---

## C. Mapa DOCUMENTO VALTER → CÓDIGO REAL (Tabela C)

| Documento | Declaração | Evidência no código | Status |
|---|---|---|---|
| `LEIA-ME.md` (pacote de documentação) | "Login Google e acesso real ao Firebase foram verificados" | `Firebase.php::FirebaseAuth::verify()` implementa verificação RS256 completa contra certificados reais do Google | **COMPROVADA** |
| `LEIA-ME.md` | "Stripe permanece desativado para a segunda fase" | `Payments.php::configured()` exige `PM_ONLINE_PAYMENTS_ENABLED==='true'`; default em `Runtime.php` é `'false'` | **COMPROVADA** (código real existe, mas desligado por configuração) |
| `LEIA-ME.md` | "envio real de e-mails... continua com pendências registradas" | `Email.php` implementa SMTP/Resend/Webhook de verdade, mas `emailConfiguration()` retorna `configured:false` sem credenciais — nenhuma credencial real está no pacote | **PARCIALMENTE COMPROVADA** — código pronto, operação não homologada |
| `RELEASE.json` / versão `0.4.11-php74` | (não lido linha a linha nesta rodada — arquivo de metadados) | `Runtime::VERSION='0.4.11-php74'` confere com o nome do pacote | **COMPROVADA** (consistência de versão) |
| Manual/Reconstrução (7.165 linhas combinadas) | Declara 79 capítulos de manual operacional cobrindo todos os papéis (cliente, parceiro, guia, motorista, admin) | Não lido linha a linha nesta rodada (volume incompatível com o escopo desta auditoria de código) — mas a **existência dos papéis e fluxos declarados está confirmada de forma independente pelo próprio código** (`roles` em `Support.php`: client/partner/guide/driver/admin/network) | **CONSISTENTE COM O CÓDIGO**, não lido exaustivamente |
| `_private/firestore.rules` (comentário no próprio arquivo) | "Browser uses Google Auth and the authenticated Node API" | O comentário cita "Node API" — mas o backend real é **PHP**, não Node. Divergência textual menor, sem impacto funcional | **CONTRADITA EM DETALHE** (comentário desatualizado/impreciso), sem efeito de segurança |

**Nota metodológica**: os 7.165 linhas de `MANUAL-OPERACIONAL.md` + `RECONSTRUCAO-COMPLETA.md` **não foram lidas linha a linha** nesta rodada — o volume é incompatível com o escopo de uma auditoria de código desta profundidade em uma única rodada. Onde a documentação foi citada acima, foi via seções específicas (`LEIA-ME.md`, comentários inline). Isso é uma limitação declarada desta auditoria, não uma omissão silenciosa — ver §44 (Veredito).

---

## D. Mapa CÓDIGO VALTER → FUNCIONALIDADE (inclui não documentado) — Tabela D

| Arquivo | Função/recurso | Documentada no LEIA-ME? | Valor para o Partiu | Destino |
|---|---|---|---|---|
| `Services.php::createGate/approveGate/executeGate` | Gate próprio (commission/bonus/refund) com **fingerprint do sujeito** (`hashKey(canonical($s))`) verificado na execução — detecta se o registro mudou entre aprovação e execução | Não mencionado no LEIA-ME | **Alto** — o padrão de fingerprint é mais robusto num ponto específico que o nosso Gate atual | Reaproveitar lógica (Grupo 2) — considerar adicionar fingerprint de estado ao nosso `gates.ts` |
| `Platform.php::command()` | Idempotência por `requestKey` do cliente + hash do payload (`request_key_conflict` se o mesmo evento chegar com payload diferente) | Não mencionado | **Alto** — mesmo problema que já resolvemos em Payment/Commission, mas aplicado uniformemente a **toda** mutação | Reaproveitar lógica (Grupo 2) |
| `Operations.php::saveGroup` | Checagem de conflito de alocação (mesmo veículo/guia/motorista em viagens com janelas de data sobrepostas) | Não mencionado | **Alto** — não existe hoje no nosso Trip Operation Foundation | Reaproveitar lógica (Grupo 2) → PM-CONV-03 |
| `Experience.php::tracking` | Rastreamento de GPS do passageiro com **consentimento explícito obrigatório**, limite de 4000 pontos com downsampling automático | Não mencionado | Médio-alto — capacidade nova, sensível (privacidade) | Reaproveitar lógica com hardening de consentimento/Audit (Grupo 2) |
| `Platform.php::OWNER_EMAIL` hardcoded | E-mail de dono do sistema hardcoded no código-fonte (`valternramos@gmail.com`) com bootstrap automático de admin | Não mencionado | Nenhum — é o oposto do nosso padrão (`SecretProvider`, sem identidade hardcoded) | **Não reaproveitar (Grupo 4)** — risco de arquitetura, não capacidade |
| `Runtime.php::environment()` | Chave pública do Firebase (`FIREBASE_WEB_API_KEY`) e Project ID hardcoded como default no código | Não mencionado | Nenhum (ver nota de segurança abaixo) | Não aplicável — não é o nosso stack |
| `Email.php::emailMessage` | Template HTML de e-mail com escape de XSS e `Message-ID` determinístico por idempotency key | Não mencionado | Médio — útil quando construirmos envio de e-mail real (fora de escopo desta rodada) | Reaproveitar lógica (Grupo 2), fase futura |
| `Rs256Token.php` | Verificação JWT RS256 hand-rolled, bloqueia ataques de confusão de algoritmo (rejeita `crit`/`jku`/`jwk`/`x5u`) | Não mencionado | Baixo para nós — não usamos JWT, usamos sessão por cookie | Não aplicável (Grupo 4, não por ser ruim, mas por incompatibilidade de padrão) |
| `Jobs.php::deliverNotifications` | Fila de e-mail com lease (120s), retry exponencial, dead-letter após 6 tentativas | Não mencionado como "fila" | Médio — mesmo padrão do nosso T5, mas ad-hoc (sem painel, sem Audit) | Reaproveitar lógica (Grupo 2) — nosso T5 Job Engine já é superior em observabilidade |

**Nota de segurança sobre a chave do Firebase hardcoded**: chaves Web API do Firebase são, pela própria documentação do Google, seguras para exposição pública (não são segredo — a segurança real depende das regras do Firestore, que aqui negam tudo ao cliente). Não é uma vulnerabilidade explorável por si só. É, porém, um problema de **higiene de configuração** (valor devia vir de env/config, não de default no código-fonte) — registrado como observação, não como vulnerabilidade crítica.

---

## E. Matriz por recurso (Tabela A + campos do comando) — cobertura completa dos domínios obrigatórios

| Recurso | Origem 0.4.11 | Equivalente oficial | Decisão | Schema impact | Segurança | Layout impact | Fase |
|---|---|---|---|---|---|---|---|
| Cliente/Passageiro | `Bookings.php::saveTraveler` (passaporte, nacionalidade, voo in/out, guardião p/ menor) | `Traveler` (sem voo, sem guardião estruturado) | **FUNDIR** | Sim — novos campos em `Traveler` | RLS/RBAC a aplicar | Zero se em componente já existente | PM-CONV-03 |
| Família/Acompanhantes | Implícito via `guardianName/guardianEmail/guardianRelationship` para menores | Não existe | **IMPORTAR/ADAPTAR** | Sim | Consentimento + Audit | Zero | PM-CONV-03 |
| Parceiros | `Services.php` (`partnerCode`, `partnerSummary`, comissão automática por código) | `Commission` só interna (via `responsavelId`, usuário do tenant) | **IMPORTAR/FUNDIR** | Sim — `Partner` como entidade externa distinta de `User` | RLS + RBAC (parceiro só vê o próprio) | Zero | PM-CONV-04 |
| Guias | `Operations.php` (`guideUids`, atribuição a grupo/veículo) | Não existe | **IMPORTAR/ADAPTAR** | Sim | RLS + RBAC | Zero | PM-CONV-03 |
| Motoristas | idem, `driverUids` | Não existe | **IMPORTAR/ADAPTAR** | Sim | RLS + RBAC | Zero | PM-CONV-03 |
| Fornecedores | `Platform::EDITABLE['suppliers']` (kind, city, contact, services) | Não existe | **IMPORTAR/ADAPTAR** | Sim | RLS | Zero | PM-CONV-03 |
| Veículo turístico | `Platform::EDITABLE['vehicles']` (capacidade, placa) | Não existe | **IMPORTAR como domínio turístico** — explicitamente **não é** KeroCar | Sim | RLS | Zero | PM-CONV-03 |
| Grupo/Saída/Operação | `Operations.php::saveGroup/operation` (crew+veículo+bookings, conflito de alocação) | `Trip` (sem crew, sem veículo, sem conflito de alocação) | **FUNDIR** com `Trip` existente | Sim — `TripGroup`/vínculo crew-veículo | RLS + Audit nas alocações | Zero | PM-CONV-03 |
| Roteiro/Paradas | `Records.php` (`routes`, `stops` com lat/lng, fornecedor por parada, `visible`) | `TripItineraryDay`/`TripActivity` (sem geolocalização, sem fornecedor vinculado) | **FUNDIR** | Sim | RLS | Zero | PM-CONV-03 |
| Reserva/Booking | `Bookings.php::reserve` (capacidade de oferta, versão de proposta, parceiro) | `Booking` (já real, sem controle de capacidade de oferta) | **FUNDIR** | Sim — parcial | RLS já existe | Zero | PM-CONV-03 |
| Proposta | `Services.php::proposal` (versionada, gera `offer` com capacidade) | `Proposal` (já versionada) | **FUNDIR** (conceitos já convergentes) | Baixo | RLS já existe | Zero | PM-CONV-03 |
| Pagamento | `Payments.php` — **Stripe real** (checkout + webhook + idempotência) | `Payment` (provider-neutro, manual apenas) | **REAPROVEITAR LÓGICA** (não o código PHP) | Sim — `provider`/`providerReference` já preparados no schema oficial | Webhook HMAC + idempotência a replicar | Zero | PM-CONV-07 (autorização própria, gateway real) |
| Comissão | `Services.php` (bps, `policyVersion`, Gate próprio) | `Commission` (já real, Gate próprio já existe) | **FUNDIR conceitos**, nosso Gate já cobre o caso | Baixo | já coberto | Zero | PM-CONV-04 |
| Premiação | `Services.php::claimReward` (campanha com meta de vendas) | Não existe | **IMPORTAR/FUNDIR** com Finance Core | Sim | RLS + Gate | Zero | PM-CONV-04 |
| QR/Check-in/Embarque | `Operations.php::createQr/arrive/board` (token 24h, fingerprint de reserva, timezone Marrocos) | Não existe | **IMPORTAR com hardening** | Sim | Token opaco já não-previsível (`bin2hex(24)`) — replicar; **adicionar Audit** que falta na 0.4.11 | Zero | PM-CONV-03 |
| Documentos | `Bookings.php` (`documentChecks` por passageiro×requisito, auto-instanciado) | `TravelerDocument`/`DocumentRequirement` (já muito próximo, já auto-instancia) | **Conceitos já convergentes**, só cruzar campos de passaporte | Baixo | já coberto | Zero | PM-CONV-03 |
| Notificações | `Platform::notice` + `Jobs.php` (fila com lease/retry/dead-letter, app+e-mail) | Não existe ainda (Notifications Foundation é a próxima etapa autorizada da sequência PM-NIGHT-RUN-02) | **REAPROVEITAR LÓGICA** | Sim (já planejado) | Nosso T5 Job Engine é superior — usar a *lógica de gatilhos*, não a fila | Zero | Já autorizado (Notifications Foundation), reaproveitar lógica quando construir |
| Aniversários | `Services.php::birthdays` + `Jobs.php::queueBirthdays` (idempotente por ano) | Não existe | **REAPROVEITAR LÓGICA** | Baixo | usar Job Engine T5 | Zero | Fase de Notifications |
| Mapas/GPS | `Experience.php::tracking` + `app/travel-map.js` (OpenStreetMap tiles, CSP já restringe a `tile.openstreetmap.org`) | Não existe | **IMPORTAR com consentimento/Audit** | Sim | Consentimento explícito já existe no Valter — replicar | Zero | Fase futura, fora do roadmap imediato |
| Offline/PWA | `app/sw.js` (cache só de shell estático, nunca `/api/`) | Não existe (Next.js não tem PWA hoje) | **AVALIAR** — padrão seguro, mas fora do roadmap PM-NIGHT-RUN-02 atual | N/A | **SEGURO** (nenhum dado sensível em cache) | Zero se adicionado depois | PM-CONV-10 |
| Ouvidoria/Suporte | `Services.php::support/review/moderate` — ticket de suporte **e** avaliação/reclamação moderada com score interno | Não existe (só Inbox/CRM, que é atendimento comercial, não pós-venda) | **IMPORTAR sem duplicar Inbox** | Sim — `SupportTicket`, `Review` | RLS + Audit na moderação | Zero | PM-CONV-04 |
| Conteúdo/Publicidade interna | `Platform::EDITABLE['content','ads']` (conteúdo editorial + anúncios internos por fornecedor, com janela de veiculação) | Não existe | **AVALIAR quando gerar valor** | Sim, se adotado | RLS | Zero | Não priorizado |
| i18n | `app/i18n.js` + `translations-extra.js` + `editorial-translations.js` (PT/EN/ES/FR de **interface**, catálogo estático) | F2 (BR/PT, moeda/fuso, **não traduz texto**) | **REAPROVEITAR catálogo/terminologia**, adaptar ao motor oficial | Baixo | N/A | Zero | PM-CONV-05 |
| Multiagência/Admin | `Platform::createAgency` (`agencies/{id}`, papel `network` cross-agência) | `Tenant` (equivalente conceitual, já com RLS) | **Conceitos já convergentes** — nosso `Tenant` é mais robusto (RLS de banco vs. isolamento só em código) | N/A | Nosso modelo é superior aqui | Zero | Já resolvido |
| Integrações externas | Stripe, SMTP/Resend/Webhook, Firebase Auth/Firestore, OpenStreetMap | Nenhuma integração externa real hoje (WhatsApp Cloud API é a exceção, já real) | Ver Tabela G | — | — | — | Várias fases |
| Dados Firestore | 20+ coleções sob `agencies/{a}/...` (ver Tabela F) | PostgreSQL/Prisma, 42 models | **Mapear 1:1 por entidade**, nunca migrar dado nesta rodada | Sim | — | Zero | PM-CONV-03 em diante |
| Assets | 28 imagens de destino, logo, ícone | Nenhum equivalente (site oficial tem os próprios) | **Avaliar caso a caso**, não substituir asset oficial sem autorização | N/A | N/A | **Sim, se usado** → parar e classificar REQUER DECISÃO DE LAYOUT | — |

---

## F. Quatro grupos de reaproveitamento

### Grupo 1 — Reaproveitamento direto
**Nenhum item.** Nenhum código PHP é diretamente compatível com Next.js/TypeScript/Prisma — confirmado por leitura completa do backend. Isso é esperado e correto: a arquitetura é outra linguagem/stack por completo.

### Grupo 2 — Reaproveitar lógica (reimplementar no oficial)
1. Fingerprint de sujeito em Gates (`Services.php::executeGate`) — detectar mudança de estado entre aprovação e execução.
2. Idempotência universal por `requestKey` + hash de payload (`Platform.php::command`).
3. Checagem de conflito de alocação (veículo/guia/motorista × janela de datas) — `Operations.php::saveGroup`.
4. Consentimento explícito + limite/downsampling de pontos de rastreamento GPS — `Experience.php::tracking`.
5. Regras de validação de passageiro/passaporte (idade→guardião, validade de passaporte vs. data de retorno) — `Support.php::passengerErrors`.
6. Cálculo de comissão em basis points com arredondamento correto — `Support.php::commission()`.
7. Webhook Stripe: verificação HMAC-SHA256 com tolerância de tempo e dedup por evento — `Payments.php::verifyStripeEvent/webhook`.
8. Fila de notificação com lease/retry exponencial/dead-letter — `Jobs.php` (nosso T5 já cobre isso melhor; usar como referência de parâmetros: 6 tentativas, backoff `30×2^n` capado em 3600s).
9. Cálculo de "aniversário devido" idempotente por ano — `Support.php::birthdayDue`.

### Grupo 3 — Reaproveitar funcionalidade/UX funcional (jornada, sem copiar layout)
1. Fluxo de convite de passageiro menor por e-mail com token de reivindicação (`claimTraveler`) — sem layout, só a jornada.
2. QR de chegada com sessão temporal (`createQr`/`arrive`) — meeting point, janela de validade, confirmação com fuso do destino.
3. "Minhas viagens" do passageiro (`records()` caso `myTrips`) — jornada equivalente à futura Traveler Area V1.
4. Painel de resumo do parceiro (`partnerSummary`) — comissões + progresso de campanha.
5. Ticket de suporte com thread de mensagens + reabertura por status.
6. Avaliação/reclamação com moderação e resposta pública, e score interno agregado.

### Grupo 4 — Não reaproveitar
1. **E-mail do dono hardcoded no código-fonte** (`OWNER_EMAIL`) — contraria nosso padrão de identidade via banco/RBAC, não SecretProvider.
2. **Autenticação exclusiva por Google OAuth** — incompatível com nosso modelo de e-mail/senha; se quisermos login social no futuro, é uma decisão própria, não uma importação.
3. **Isolamento multi-tenant só em código de aplicação** (Firestore rules negam tudo ao cliente; toda a proteção depende de `$this->agency($a)` nunca falhar) — nosso RLS de banco é estritamente superior; não regredir para esse modelo.
4. **JWT RS256 hand-rolled** — não usamos JWT; não há necessidade de portar.
5. **Firestore como armazenamento** — fora de cogitação, já decidido.
6. **`list()` de coleção inteira filtrado em memória PHP** (sem índice composto, sem paginação de verdade) — não escalável, não replicar o padrão de acesso a dado, só a regra de negócio.
7. **PHP 7.4 / polyfills de string** (`Compat.php`) — não aplicável ao nosso stack Node.

---

## G. Lista "NÃO PERDER NADA" — recursos exclusivos úteis da 0.4.11

| Funcionalidade | Arquivo | Valor | Destino | Fase |
|---|---|---|---|---|
| Operação turística com crew (guia+motorista+veículo) e detecção de conflito de alocação | `Operations.php` | Alto | Core turístico | PM-CONV-03 |
| QR/check-in de chegada com sessão temporal e timezone do destino | `Operations.php::createQr/arrive` | Alto | Core turístico | PM-CONV-03 |
| Embarque (boarding) como gatilho de comissão "a pagar" | `Operations.php::board` | Alto | Core turístico + Finance | PM-CONV-03/04 |
| Progresso de parada em tempo real (planned/current/completed/skipped) | `Experience.php::stopProgress` | Médio-alto | Core turístico | PM-CONV-03 |
| Parceiro com código próprio e comissão automática na reserva | `Bookings.php::reserve` | Alto | Comissões | PM-CONV-04 |
| Campanha de premiação com meta de vendas | `Services.php::claimReward` | Médio | Comissões | PM-CONV-04 |
| Ticket de suporte + avaliação/reclamação moderada com score interno | `Services.php::support/review/moderate` | Alto | Ouvidoria | PM-CONV-04 |
| Rastreamento GPS com consentimento e limite de pontos | `Experience.php::tracking` | Médio | Mapas/GPS | fase futura |
| Câmbio manual com fonte e data, base EUR | `Experience.php::exchange` | Médio | Moeda/câmbio | PM-CONV-07 |
| Aniversário automático idempotente | `Services.php::birthdays` | Baixo-médio | Notifications | fase de Notifications |
| Integração Stripe completa (checkout + webhook) | `Payments.php` | **Alto** | Payments internacional | PM-CONV-07, autorização própria |
| Envio de e-mail real (3 provedores) | `Email.php` | Alto | Notifications/E-mail | fase futura |
| Catálogo de termos em 4 idiomas de interface | `app/i18n.js`, `translations-extra.js` | Médio | i18n | PM-CONV-05 |
| Service worker seguro (nunca cacheia `/api/`) | `app/sw.js` | Baixo (referência de padrão) | PWA/offline | PM-CONV-10 |
| Cadastro de saúde do passageiro com consentimento explícito | `Platform.php::saveProfile` (`care`) | Médio (sensível — LGPD) | Core turístico | PM-CONV-03, com revisão de consentimento |

---

## H. Matriz de regressões — o que se perderia se a arquitetura do Valter substituísse a oficial

| Capacidade | Oficial | Valter 0.4.11 | Risco se substituído | Decisão |
|---|---|---|---|---|
| Isolamento multi-tenant | RLS **no banco** (PostgreSQL), fail-closed, defesa em profundidade | Isolamento **só em código de aplicação** (`$this->agency($a)`); Firestore rules negam tudo, então nem a "rede de segurança" das rules ajuda — um bug de aplicação vaza dado entre agências sem qualquer barreira de banco | **Crítico** | MANTER RLS oficial, nunca regredir |
| SecretProvider | Toda credencial nova passa por abstração, nunca hardcoded | E-mail do dono e chave pública do Firebase hardcoded como default no código-fonte | Alto (higiene) | MANTER SecretProvider |
| Gates/Audit | Sistema único e testado, usado por todo domínio sensível (Booking/Payment/Commission) | Gate próprio reimplementado (com fingerprint — ver §D), Audit bem mais simples (`action, actorUid, subjectId, at`, sem `resultado`/`detalhe`/`entidade`) | Médio | MANTER Gates/Audit oficiais, **importar a lógica de fingerprint** |
| Cost Control | Camada dedicada de medição→limite→alerta→bloqueio para custo de IA | Inexistente na 0.4.11 (não há uso de IA na entrega) | N/A | MANTER |
| Tool Broker/Agent Grants/Yalla | Registry default-deny, Camadas 1-2 | Inexistente | N/A | MANTER |
| Job/Execution Engine | T5: claim atômico, lease/heartbeat, retry/backoff, dead-letter, **observável e auditado** | `Jobs.php`: fila simples sem painel, sem Audit, sem claim atômico multi-worker (roda via `console.php worker`, provavelmente cron único) | Médio se substituído | MANTER T5, usar Valter só como referência de parâmetros |
| Attribution | UTM/gclid/fbclid/landing/referrer, testado | `publicLead` só grava `source`/`campaign` simples | Baixo | MANTER Attribution oficial |
| Testes automatizados | 468 testes, incluindo isolamento cross-tenant negativo | **Zero testes automatizados encontrados** no pacote de código 0.4.11 | Alto se a 0.4.11 virasse base | MANTER disciplina de testes oficial |
| Autenticação | E-mail/senha com bcrypt, sessão httpOnly, RBAC por tenant | Google OAuth exclusivo, papéis como array de strings sem RBAC granular por permissão | Médio | MANTER Auth oficial |

---

## I. Inventário de rotas/páginas finais + Help Key proposto

Cobre as rotas **já existentes no oficial** (que devem manter `helpKey` quando o Help System for construído — não é feito nesta rodada, só planejado) e as rotas que **passarão a existir** se o Core Turístico (PM-CONV-03) for aprovado.

| Rota | Papel | Origem | Decisão | Help Key proposto | Locales |
|---|---|---|---|---|---|
| `/dashboard` | Painel | Oficial | manter | `dashboard.overview` | PT-BR/PT-PT/EN/ES/FR |
| `/leads`, `/leads/[id]` | Vendas | Oficial | manter | `leads.list`, `leads.detail` | idem |
| `/inbox` | Atendimento | Oficial | manter | `inbox.overview` | idem |
| `/canais` | Config. WhatsApp | Oficial | manter | `canais.whatsapp` | idem |
| `/gates` | Aprovações | Oficial | manter | `gates.overview` | idem |
| `/custos` | Cost Control | Oficial | manter | `custos.overview` | idem |
| `/politica-comercial` | Política comercial | Oficial | manter | `politica.overview` | idem |
| `/documentos` | Requisitos de documento | Oficial | manter | `documentos.overview` | idem |
| `/viagens`, `/viagens/[id]` | Trip Operation | Oficial | manter | `viagens.list`, `viagens.detail` | idem |
| `/jobs` | Job Engine | Oficial | manter | `jobs.overview` | idem |
| *(proposta)* `/operacao/grupos` | Grupos/crew/veículo | Nova, origem 0.4.11 `Operations.php` | REQUER PM-CONV-03 | `operacao.grupos` | idem |
| *(proposta)* `/operacao/checkin` | QR/chegada/embarque | Nova, origem 0.4.11 | REQUER PM-CONV-03 | `operacao.checkin` | idem |
| *(proposta)* `/parceiros` | Parceiros/comissão por código | Nova, origem 0.4.11 | REQUER PM-CONV-04 | `parceiros.overview` | idem |
| *(proposta)* `/ouvidoria` | Tickets + avaliações moderadas | Nova, origem 0.4.11 | REQUER PM-CONV-04 | `ouvidoria.overview` | idem |
| *(proposta)* `/viagens/[id]/rastreamento` | GPS com consentimento | Nova, origem 0.4.11 | AVALIAR — fase futura | `rastreamento.overview` | idem |

Nenhuma rota nova foi criada nesta rodada — a tabela acima é **proposta**, para uso em PM-CONV-03 em diante.

---

## J. Bloqueadores de produção

| Bloqueador | Risco | Dependência | Fase | Critério de resolução |
|---|---|---|---|---|
| Nenhum gateway de pagamento real conectado no oficial | Alto (impede cobrança real) | Autorização do fundador + credencial real | PM-CONV-07 | Gateway homologado, webhook validado, idempotência testada |
| Domínio operacional turístico (guia/motorista/veículo/grupo/QR) ausente no oficial | Alto (impede operação real de viagem em grupo) | Especificação PM-CONV-03 | PM-CONV-03 | Domínio único, RLS/RBAC/Audit, testes, zero mudança visual |
| Sem envio de e-mail real no oficial | Médio | Provedor de e-mail (SMTP/Resend) + credencial | Fase de Notifications | Provedor configurado e verificado (`verify-email` equivalente) |
| WhatsApp Business (WABA) não homologado em conta real | Médio | Homologação Meta | já sinalizado, fora desta rodada | Conta de produção homologada |
| Sem tradução automática de conversa/atendimento internacional | Médio | Construção nova (Fase 3 do roadmap geral) | PM-CONV-06 | Original + tradução preservados, testado |
| `git init` ainda não executado | Baixo (não é bloqueador técnico, é decisão) | Decisão do fundador | — | Fundador autoriza |
| Nenhum teste automatizado na 0.4.11 para validar paridade de regra de negócio ao portar | Médio | Escrever testes no oficial ao portar cada regra | PM-CONV-03 em diante | Toda regra portada nasce com teste |

---

## K. Especificação proposta do PM-CONV-03 (Core Turístico) — **NÃO EXECUTAR**

Preparada como ponto de partida para a próxima autorização, não implementada nesta rodada.

**Escopo**: Passageiro (campos ampliados: passaporte, voo, guardião), Guia, Motorista, Fornecedor, Veículo, Grupo (crew + veículo + reservas, com detecção de conflito de alocação), QR/Check-in/Embarque.

**Entidades novas propostas** (Prisma, nomes provisórios): `Guide`, `Driver`, `Supplier`, `Vehicle`, `TripGroup` (liga `Trip` a crew+veículo+`Booking[]`), `ArrivalSession`, `Arrival`, `Boarding`. Extensão de `Traveler` com campos de passaporte/voo/guardião (hoje ausentes).

**Migrations necessárias**: pelo menos 2 (schema + RLS), seguindo o padrão de duas migrations já estabelecido em todo o projeto.

**Serviços/rotas**: espelhar os padrões `criar*`/`mover*Status`/`listar*` já usados em `trip.ts`/`booking.ts`; nenhuma rota nova sem `requirePermission`.

**RBAC**: novas permissões propostas — `operacao.grupos.view`/`.manage`, `operacao.checkin.manage`.

**RLS**: toda entidade nova tenant-scoped, RLS fail-closed, teste de isolamento cross-tenant obrigatório (mesmo padrão de todas as etapas anteriores).

**Audit**: eventos `GRUPO_CRIADO`, `CHECKIN_QR_GERADO`, `CHEGADA_CONFIRMADA`, `EMBARQUE_CONFIRMADO`.

**Gates**: avaliar se conflito de alocação detectado deve virar Gate ou erro direto (a 0.4.11 usa erro direto — replicar essa decisão, mais simples e já validada por uso real).

**Help/i18n**: `helpKey` por rota nova desde o commit inicial (regra já vigente para toda página nova).

**Testes**: unit (máquina de estados de check-in/embarque), integração (conflito de alocação, RLS), sem E2E nesta primeira entrega (seguir o padrão das etapas anteriores).

**Definition of Done**: replicar exatamente o padrão das 5 etapas já concluídas do PM-NIGHT-RUN-02 — testes verdes, typecheck/build limpos, RLS testado, zero mudança de layout, relatório de fechamento individual.

---

## Tabelas obrigatórias — referência cruzada

As Tabelas A a J exigidas pelo comando estão todas cobertas acima: **A** = §E, **B** = §B + arquivos individuais citados ao longo do documento, **C** = §C, **D** = §D, **E** = §E, **F** = citada em §E (linha "Dados Firestore" — mapeamento completo entidade-a-entidade fica para a especificação de PM-CONV-03, não repetido aqui por redundância), **G** = ver abaixo, **H** = §G, **I** = §H, **J** = §J.

### Tabela G — Integrações (estado real, não presumido)

| Integração | Oficial | Valter 0.4.11 | Estado real | Ação |
|---|---|---|---|---|
| WhatsApp/Meta | Cloud API real, multi-tenant | Não presente na 0.4.11 | **REAL** (oficial) | manter |
| Stripe | Não existe | Checkout + webhook real, **desativado por config** (`PM_ONLINE_PAYMENTS_ENABLED=false`) | **PARCIAL** (código real, não homologado/ligado) | avaliar em PM-CONV-07 |
| E-mail (SMTP/Resend/Webhook) | Não existe | Real, 3 provedores, **não configurado** (sem credencial no pacote) | **PARCIAL** | avaliar na fase de Notifications |
| Firebase Auth (Google) | Não existe (login é e-mail/senha) | Real, **verificado** segundo a própria documentação do Valter | **REAL**, mas não é o nosso modelo de auth | não adotar como login principal |
| Firestore | Não existe | Real, mas sem RLS de banco (rules negam tudo ao cliente) | **REAL**, com o risco já descrito em §H | não adotar como storage |
| OpenAI/Anthropic | Não presente na 0.4.11 nem no oficial fora do Tool Broker (Yalla) | Não presente | **NÃO ENCONTRADO** na 0.4.11 | N/A |
| ElevenLabs | Não presente | Não presente | **NÃO ENCONTRADO** | Fase 3/PM-CONV-06, futuro |
| Google Ads/Meta Ads/GA4/Search Console | Não presente | Não presente | **NÃO ENCONTRADO** | PM-CONV-08, futuro |
| Maps (OpenStreetMap) | Não existe | Real (`travel-map.js`, CSP restringe a `tile.openstreetmap.org`) | **REAL** | avaliar em fase futura |

---

## 44. Veredito

**PM-CONV-02 CONCLUÍDO, com uma limitação declarada.**

Concluído: localização física de ambos os projetos confirmada com evidência (caminho, stack, contagens); separação completa da entrega 0.4.11 por categoria; **leitura integral de 100% do código de domínio próprio da 0.4.11** (16 arquivos PHP, 794 linhas, mais os módulos de frontend e as regras de Firestore); mapa documento→código e código→funcionalidade com evidência de arquivo; matriz de recursos cobrindo todos os domínios exigidos pelo comando (cliente/passageiro, parceiro, guia, motorista, fornecedor, veículo, grupo/saída/operação, QR/check-in/embarque, documentos, notificações, aniversários, mapas/GPS, offline/PWA, ouvidoria, conteúdo, i18n, multiagência, integrações, Firestore, assets); os quatro grupos de reaproveitamento preenchidos; lista "não perder nada"; matriz de regressões cobrindo todas as 8 capacidades listadas no comando; inventário de rotas com Help Key proposto; bloqueadores de produção; especificação (não executada) do PM-CONV-03.

**Limitação declarada**: os dois documentos longos do Valter (`MANUAL-OPERACIONAL.md`, 2.976 linhas, e `RECONSTRUCAO-COMPLETA.md`, 4.189 linhas — total 7.165 linhas) **não foram lidos linha a linha** nesta rodada; foram consultados pontualmente (`LEIA-ME.md` na íntegra, comentários-chave). Isso não compromete a matriz de recursos nem as decisões acima — **todas ancoradas em código real, lido por completo**, conforme a própria regra do comando ("código real prevalece sobre documentação declaratória") — mas significa que uma eventual funcionalidade descrita **apenas em prosa**, sem estar implementada no código lido, pode não ter sido capturada. Nenhuma evidência encontrada sugere que isso tenha ocorrido (o LEIA-ME.md, que resume a situação operacional, foi lido integralmente e é consistente com o código).

---

## 45. PARAR

**Relatório encerrado aqui, conforme instrução.**

Nada foi alterado no código, schema, layout ou configuração do sistema oficial. Nenhuma migration foi criada. Nenhum commit ou push foi feito. **PM-CONV-03 não foi iniciado** — apenas especificado em §K, para avaliação. Aguardando autorização do fundador para prosseguir.
