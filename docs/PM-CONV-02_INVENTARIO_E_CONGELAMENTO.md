# PARTIU MARROCOS / KEROMIND — PM-CONV-02
## Inventário físico, rastreabilidade e congelamento da convergência

**Data:** 16/09/2026 · **Modo:** auditoria/inventário/planejamento — **nenhum código, schema, migration, layout, commit ou push foi alterado nesta rodada.** · **Base normativa:** `PM_CONVERGENCIA_MESTRE_v1.0_CODE.docx` (decisão arquitetural já tomada, não rediscutida aqui).

**Método:** leitura real de arquivo (nunca memória/suposição): schema Prisma completo, estrutura `apps/web/src` completa, todos os 17 arquivos PHP reais do pacote Valter, todos os 24 arquivos JS/CSS/HTML reais do frontend Valter, a documentação técnica completa do Valter (`RECONSTRUCAO-COMPLETA.md`, 4189 linhas — as ~576 linhas de prosa foram lidas integralmente; o anexo de 3600 linhas é código-fonte duplicado do que já foi lido diretamente dos arquivos reais, então não foi relido), os 8 documentos de continuidade mais recentes do lado oficial. Todo achado abaixo cita arquivo real.

---

## 1. Localização física dos dois projetos

### A — Sistema oficial (KeroMind / Partiu Marrocos)

| Campo | Valor |
|---|---|
| Caminho absoluto | `D:\Projetos\Agencia de turismo internacional` |
| Stack | pnpm monorepo — Next.js 14.2.13 (App Router) + TypeScript 5.6 + React 18.3, PostgreSQL via Prisma 5.x, Tailwind, Vitest |
| Estrutura | `apps/web` (app), `packages/db` (schema + lógica de domínio compartilhada), `packages/config` |
| Banco | PostgreSQL com **Row Level Security real** (`packages/db/prisma/rls.sql`, 248 linhas) — não é filtro de aplicação, é política do Postgres, `FORCE ROW LEVEL SECURITY` por tabela |
| Git | **Não inicializado** (`git status` confirma "not a git repository") — decisão pendente do fundador, já documentada como tal em `STATUS_GERAL_PARTIU_MARROCOS.md` |
| Migrations | 39 aplicadas (confirmadas no `STATUS_COMPLETO`), 100% aditivas — inclui uma migration de **remoção**: `20260915000000_remove_kerocar_domain` (domínio KeroCar/telemetria automotiva OBD2, produto não-relacionado, removido por autorização explícita do fundador — nunca confundir esse "Vehicle" removido com o "veículo de excursão" que a 0.4.11 do Valter tem) |
| Testes | 49 arquivos de teste (`packages/db/tests`: 32 · `apps/web/tests`: 17), runner Vitest — não contei casos individuais, só arquivos |
| Rotas | 15 `page.tsx` + 7 `route.ts` (API) — mutações de domínio passam por **Server Actions** (`app/actions/*.ts`), não por API REST |
| Documentação | 131 arquivos em `docs/` + `DOCUMENTO-DE-FUNDACAO-PARTIU-MARROCOS.md`, `PADRAO-DESENVOLVIMENTO-KEROMIND.md` na raiz |
| Terceiro componente (não mencionado no mandato, achado real) | `site-original/partiumarrocos.com.br/` — site público estático **já pronto**, GSAP+ScrollTrigger, 45 arquivos, com `admin.html`/`save.php`/`upload.php` legados (ver §9, achado de segurança já corrigido) — formulário já grava lead real no CRM |

### B — Entrega 0.4.11 do Valter

| Campo | Valor |
|---|---|
| Origem física real | `C:\Users\henri\Downloads\partiumarrocos.com.br-php74-0.4.11 codigo` (ZIP sem extensão visível, assinatura PK confirmada) + `DOCUMENTACAO-COMPLETA-PARTIU-MARROCOS-0.4.11 comppleta` (ZIP de documentação) |
| Stack | PHP 7.4.33 x64 (sem framework, roteador próprio em `index.php`) + Firebase Auth (Google) + Firestore (REST direto, sem SDK oficial) + frontend vanilla JS ES modules (sem bundler/framework) |
| Arquivos reais (fora de `vendor/`) | 90 — 19 PHP, 20 JS, 7 JSON, 5 MD, 3 CSS, 28 JPG, 1 HTML, 1 webmanifest, 1 SVG, 1 PNG, 1 `.htaccess`×2, 1 lock |
| Dependências PHP (Composer, fixadas em lock) | PHPMailer 6.12, BaconQrCode 2.0.8, dasprid/enum 1.0.7 |
| Git | Nenhum repositório Git no pacote entregue (é um release montado, não um checkout de repo) |
| Testes declarados na doc, **não presentes no pacote realmente extraído** | `sistema/php74/tests/*` (bridge.php, jwt-compat.php, jwt-interop.mjs, jwt-reference.php, parity.mjs, payments.php, preview-router.php, security.php, token-fixture.php) — ver §5, discrepância documentada |
| Documentação | `MANUAL-OPERACIONAL.md`/`.pdf` (79 capítulos, 88 páginas), `RECONSTRUCAO-COMPLETA.md` (4189 linhas), `LEIA-ME.md`, `INVENTARIO-ARQUIVOS.json` (739 arquivos com SHA-256, inclui histórico de protótipos v2-v11 em `proposta/` — material de design/iteração, não código de produção) |
| Estado operacional declarado (LEIA-ME.md) | Login Google e Firestore real verificados; HTTPS/e-mail/homologação completa **pendentes**; Stripe desativado (fase 2) |

---

## 2. Separação da entrega 0.4.11 por categoria (§5 do mandato)

| Categoria | Conteúdo real encontrado |
|---|---|
| **A. Documentação** | `RECONSTRUCAO-COMPLETA.md`, `MANUAL-OPERACIONAL.md/.pdf`, `MANUAL-NAVEGAVEL.html`, `LEIA-ME.md`, `INVENTARIO-ARQUIVOS.json`, `VALIDACAO-DOCUMENTACAO.json`, + docs internos do release (`COMPATIBILIDADE-74.md`, `INSTALACAO.md`, `README.md`, `SITE-RENOVADO.md`, `VALIDACAO.md`) |
| **B. Backend** | 16 classes/traits PHP em `_private/src/` + `bin/console.php` + `index.php` (router raiz) — ver Tabela B |
| **C. Frontend** | 20 arquivos JS + 3 CSS + `index.html` + `manifest.webmanifest` em `app/` — ver Tabela B |
| **D. Firebase/Firestore** | `firestore.rules` (nega 100% acesso direto do navegador — só o backend PHP acessa), `firestore.indexes.json` (vazio — nenhum índice composto declarado), `Firebase.php` (cliente REST próprio completo: Auth + Firestore + transações) |
| **E. Auth** | Firebase Authentication (login Google) verificado via `Rs256Token.php` (RS256 escrito à mão, não usa `firebase/php-jwt` — decisão deliberada, ver §8) |
| **F. Regras de negócio** | Comissão (basis points, half-up), Gates financeiros (3 etapas: solicitar→aprovar→executar, com fingerprint anti-alteração), QR check-in (token 192 bits, só hash persistido), booking state machine, recompensas por meta de campanha — ver §8 |
| **G. Integrações** | Stripe Checkout + webhooks (real, porém desligado por padrão), SMTP/Resend/webhook para e-mail, Google OAuth2/Identity Toolkit/Firestore REST |
| **H. Testes** | Declarados na documentação (`sistema/php74/tests/*`, `sistema/plataforma/test/*`) mas **ausentes do pacote realmente extraído** — ver §5 |
| **I. PWA/offline** | `manifest.webmanifest`, `sw.js` (cache real, network-first, ~34 arquivos do app-shell), `offline.js` (IndexedDB real), `offline-mode.js` (fallback funcional) |
| **J. Assets** | `app/assets/*.jpg` (28 fotos de destino), 1 logo SVG — imagens editoriais, sem licença declarada nos arquivos |
| **K. Scripts/build/deploy** | Nenhum script de build no release final (`releases/php74-0.4.11` é o pacote **já montado**, sem depender de Node/Composer no servidor — o builder `build.mjs` existe só na árvore de desenvolvimento `sistema/`, fora do escopo do release) |
| **L. Dados/seeds/fixtures** | `starter-catalog.json` (catálogo inicial de exemplo), `manual-data.json` (conteúdo do manual embutido no app, rota `/manual` protegida) |

---

## 3. Inventário arquivo por arquivo — Backend PHP (Tabela B, parte 1)

| Arquivo | Responsabilidade real | Rotas que expõe (via `Api.php`) | Dependência externa real |
|---|---|---|---|
| `index.php` | Router raiz único: CSP/headers de segurança, despacha `/api/*` para `Api`, serve estático de `app/` com allowlist de extensão e proteção path-traversal | — | — |
| `src/Api.php` | Front controller: CORS, parsing, rate-limit (10/min/IP em `lead`), despacho para as 28 ações + 10 consultas | Todas as rotas HTTP | BaconQrCode (SVG do QR) |
| `src/Platform.php` | Agregador central (compõe as traits abaixo), auth/RBAC por regex de nome de ação, idempotência de comando (`requestKey` + fingerprint), bootstrap do dono/agência, registro/perfil | `me`, `register`, `profile` | — |
| `src/Records.php` (trait) | Catálogo público + CRUD administrativo genérico sobre `const EDITABLE` (routes/offers/suppliers/vehicles/trips/stops/content/ads/rewardCampaigns/leads/tasks/documentRequirements), controle de concorrência otimista por `revision` | `records/{colecao}`, catálogo público | — |
| `src/Bookings.php` (trait) | Reserva, passageiros, convite de passageiro, atualização admin, pagamento manual, política de comissão | `reserve`, `traveler`, `claim-traveler`, `booking-update`, `payment`, `policy` | — |
| `src/Operations.php` (trait) | Grupos (alocação veículo/guia/motorista, detecção de conflito), QR de chegada (criação/confirmação), embarque, itinerário | `group`, `create-qr`, `arrival`, `boarding`, `operation`, `itinerary` | — |
| `src/Services.php` (trait) | Outbox, checagem de documento, cancelamento, staff/convites, criação de agência, propostas, **Gates financeiros** (3 etapas), recompensas, ouvidoria/avaliação/moderação, aniversários, lead público | `document-check`, `booking-cancel`, `staff`, `member-status`, `agency`, `proposal`, `gate-*`, `reward-claim`, `case`, `review`, `moderation`, `birthdays`, `lead` | — |
| `src/Experience.php` (trait) | GPS tracking real, progresso de parada, câmbio manual, notificações lidas, resumo do parceiro | `tracking`, `stop-progress`, `exchange`, `notification-read`, `partner-summary` | — |
| `src/Firebase.php` | Cliente REST completo (sem SDK): HTTP+cache de arquivo, OAuth2 de conta de serviço, verificação de ID token, **Firestore reimplementado do zero** (codec + transações com retry otimista) | — | oauth2.googleapis.com, identitytoolkit, firestore.googleapis.com |
| `src/Rs256Token.php` | JWT RS256 restrito escrito à mão (rejeita `crit`/`b64`/`jku`/`jwk`/`x5u`) — mitigação deliberada de CVE-2025-45769 da lib padrão | — | OpenSSL nativo |
| `src/Payments.php` | Stripe Checkout Sessions + webhook (validação manual de assinatura HMAC), **real porém desligado por padrão** | `checkout`, `payment-options`, webhook Stripe | api.stripe.com |
| `src/Email.php` | E-mail transacional via SMTP/Resend/webhook, dedup por Message-ID | — | PHPMailer, api.resend.com |
| `src/Jobs.php` | Fila de aniversários + entrega de e-mail com lease/retry/dead-letter (cron via `console.php worker`) | — | — |
| `src/Runtime.php` | Bootstrap de ambiente, checklist de prontidão, promoção de admin, import de catálogo | `readiness`, `import-catalog` | — |
| `src/Compat.php` | Polyfill PHP8→7.4 (`str_starts_with` etc.) | — | — |
| `src/Support.php` | Utilitários puros: comissão (basis points), idade, código de pessoa (`PM{papel}{agência}{seq}`), validação | — | — |
| `src/load.php` | Autoload manual em ordem de dependência | — | — |
| `bin/console.php` | CLI (bloqueia acesso via web): `check-config`, `bootstrap`, `import-catalog`, `worker`, `verify-email`, `verify-firebase` | — | — |

## 4. Inventário arquivo por arquivo — Frontend JS (Tabela B, parte 2)

| Arquivo | Responsabilidade real | Chama backend/3ºs |
|---|---|---|
| `app.js` | Núcleo do SPA autenticado: roteador hash, cliente HTTP com idempotência, ~20 páginas, ~50 ações, SSE/polling de notificação, bootstrap Firebase | `/api/{agency}/*` (todas), Firebase Auth (vendorizado) |
| `experience.js` | Camada "editorial" que sobrescreve/estende `app.js`: dashboard por papel, GPS real (`watchPosition`, fila, geofencing cultural), leitura de QR por câmera, checkout Stripe, painel de prontidão de integrações | `/api/tracking`, `/api/checkout`, `BrowserQRCodeReader` (vendorizado), Stripe (redirect) |
| `access.js` | Tela de escolha/login de área por papel | — |
| `forms.js` | Motor schema-driven de formulários (10 tipos de campo), schemas de todas as entidades administrativas | — |
| `i18n.js` | Dicionário estático chave=texto-PT→EN/ES/FR, formatação de moeda/data, sanitização HTML | — |
| `translations-extra.js` / `editorial-translations.js` | Extensões do dicionário de UI / overrides de conteúdo editorial por idioma | — |
| `catalogs.js` | Listas de referência (países via `Intl.DisplayNames`, aeroportos, cidades, dietas) | `Intl` nativo |
| `choices.js` | Progressive enhancement de `<select>` (busca, multi-select com checkbox) | — |
| `qr.js` | Validação/parsing de token de QR já escaneado (allowlist de origem) — **não gera nem lê câmera** | — |
| `travel-map.js` | Mapa SVG **próprio** (projeção Mercator manual, `geo.json`/`roads.json` locais, créditos OSM/Natural Earth) — nunca Google Maps/Mapbox/Leaflet | assets locais |
| `offline.js` / `offline-mode.js` | IndexedDB real (CRUD de viagem salva) / tela de fallback quando offline com dados salvos | IndexedDB nativo |
| `sw.js` | Service Worker, cache network-first de ~34 arquivos do app-shell | Cache Storage nativo |
| `public-site.js` / `public-navigation.js` / `public-catalog.js` | Landing pública editorial (destinos/roteiros/experiências/FAQ), scroll-spy, wrapper de resiliência (site nunca cai se o catálogo falhar) | `/api/catalog` (anônimo) |
| `editorial-data.js` | Conteúdo de marketing hardcoded (preços em R$, depoimentos, elenco fictício) | — |
| `amazigh-journal.js` | Bloco editorial estático sobre cultura amazigh (4 idiomas hardcoded) | — |
| `request-id.js` | Geração de UUID para idempotência, com fallback sem `crypto.randomUUID` | `crypto` nativo |
| `app.css` / `experience.css` / `public-site.css` | 3 folhas de estilo ad-hoc (claro/operacional, escuro/editorial, marketing "cinema") — sem design system formal, sem tokens sistemáticos | — |
| `index.html` | Shell único, carrega 3 CSS + `app.js` como module (demais ~19 módulos importados em cascata) | — |
| `manifest.webmanifest` | PWA mínimo (1 ícone SVG, sem shortcuts/screenshots) | — |

---

## 5. Mapa Documentação Valter → Código real (Tabela C)

| Declaração da documentação | Status | Evidência |
|---|---|---|
| "17 arquivos PHP reais implementam toda a lógica de negócio" | **COMPROVADA** | Confirmado por leitura integral dos 17 arquivos — nenhum vazio/trivial |
| "Arquitetura: `sistema/php74/src/MemoryStore.php` — banco em memória exclusivo de teste" | **CONTRADITA PELO CÓDIGO** | `MemoryStore.php` não existe no pacote realmente extraído (`releases/php74-0.4.11`); é descrito só na árvore de desenvolvimento mais ampla que gerou o release, nunca entregue |
| "Testes em `sistema/php74/tests` (`security.php`, `payments.php`, `jwt-compat.php` etc.) e `sistema/plataforma/test`" | **CONTRADITA PELO CÓDIGO** | Nenhuma pasta `tests/` existe no pacote `_private` extraído — os testes existiram na árvore de desenvolvimento, não foram incluídos no release entregue |
| "Paridade Node/PHP 244/244; segurança 135→136; JWT 41; HTTP local 33" | **NÃO COMPROVÁVEL** | São números de relatórios de marcos anteriores (protótipos v2-v11), não reproduzíveis a partir do pacote entregue (sem os arquivos de teste) |
| "Stripe está desativado para a fase 2" | **COMPROVADA** | `Runtime.php` (default `PM_ONLINE_PAYMENTS_ENABLED=false`), `config.example.php` linha 20, `Payments::configured()` exige a flag — mas o código de integração em si é real e completo, não um stub |
| "Login Google e acesso real ao Firestore foram verificados" | **PARCIALMENTE COMPROVADA** | O código implementa isso corretamente (Firebase.php), mas a VERIFICAÇÃO em si (execução real contra o projeto `partiumarrocos-48929`) é um relato da conversa de desenvolvimento, não algo auditável a partir do código estático |
| "QR de chegada: token de 24 bytes, só hash persistido" | **COMPROVADA** | `Operations::createQr()`, `bin2hex(random_bytes(24))`, `hashKey($token)` — confirmado linha a linha |
| "Comissão inicial 5%, política editável" | **COMPROVADA** | `agencies/{a}.commissionBps` default 500, `Bookings::policy()` permite 0-10000 bps, versionado |
| "Firestore rules negam acesso direto do navegador" | **COMPROVADA** | `firestore.rules`: `match /{document=**} { allow read, write: if false; }` |
| "i18n cobre PT/EN/ES/FR, sem tradução automática universal" | **COMPROVADA** | Confirmado por leitura de `i18n.js`/`translations-extra.js`/`editorial-translations.js` — dicionário estático, zero chamada a serviço de tradução |
| "`SITE-RENOVADO.md`/protótipos v2-v11 e mockups em `proposta/`" | **HISTÓRICO, NÃO É CÓDIGO DE PRODUÇÃO** | Confirmado via `INVENTARIO-ARQUIVOS.json` — são ~600 arquivos de iteração de design (mockups HTML standalone, scripts Python de geração de mockup, imagens de verificação visual), nunca fizeram parte do release `php74-0.4.11` |

## 6. Funcionalidades no código sem documentação clara (Tabela D)

| Achado (arquivo) | Valor | Destino sugerido |
|---|---|---|
| E-mail do proprietário hardcoded no código-fonte (`Platform.php`, `OWNER_EMAIL='valternramos@gmail.com'`) | Alto risco se reaproveitado sem trocar — é a identidade pessoal do DESENVOLVEDOR, não do dono real do Partiu Marrocos | **NÃO REAPROVEITAR literalmente** — se a lógica de "proteção do titular" for portada, o e-mail precisa vir de configuração/dado real, nunca hardcoded de novo (nem com o e-mail certo) |
| Chave Web do Firebase hardcoded como default em `Runtime.php` | Baixo risco real (é uma Web API Key, pública por design), mas é prática que não deve ser copiada (config deveria vir só de env/arquivo) | Nota de auditoria, não bloqueador |
| Gate financeiro de 3 etapas com verificação de fingerprint do registro entre aprovação e execução (`Services.php`, `subjectFingerprint`) | **Ideia genuinamente boa**, sem equivalente confirmado no `Gate` do schema oficial (que registra `acaoProposta`/`motivo` mas — não confirmado se já valida que o registro-alvo não mudou entre aprovação e execução) | **Grupo 2 — reaproveitar lógica**: avaliar se o `Gate` oficial já cobre isso; se não, é um reforço real digno de PM-CONV-04 |
| Decimação de pontos GPS acima de 4000 pontos (`Experience.php::tracking`) | Prevenção real de estouro de documento Firestore (limite de tamanho) | Grupo 2 — regra a preservar se GPS tracking for portado |
| `commission()` com arredondamento "half-up" em basis points sobre inteiros (`Support.php`) | Evita erro de ponto flutuante em dinheiro — já é a mesma disciplina que `PADRAO-DESENVOLVIMENTO-KEROMIND.md` exige ("sempre decimal, nunca float") | Grupo 2 — fórmula exata vale a pena revisar ao implementar `Commission` de indicação de parceiro no oficial |
| `qr.js`: allowlist explícita de origem/domínio antes de aceitar um token de QR escaneado | Mitigação real contra QR malicioso redirecionando para outro domínio | Grupo 2 |

---

## 7. Cobertura funcional por domínio (Tabela A mestre)

| Domínio (§12 do mandato) | Existe no OFICIAL? | Existe na 0.4.11? | Decisão |
|---|---|---|---|
| Cliente/Passageiro/família/acompanhantes | Parcial (`Traveler`, sem "família"/"acompanhante" como conceito, sem `care`/saúde) | Sim (`profiles`+`care`, responsável por menor, convite de passageiro) | **FUNDIR** — Traveler vira a base; incorporar campos de contato de emergência, `care` (saúde/restrições com consentimento), fluxo de convite por token |
| Parceiro (afiliado externo, comissão de indicação) | **Não existe** (confirmado: comentário explícito no código oficial dizendo que "Partner" ainda não existe) | Sim, completo (código PM##, comissão, recompensa por meta) | **IMPORTAR/ADAPTAR** — maior gap real de negócio confirmado nos dois lados |
| Guia | Não existe | Sim (papel `guide`, atribuído a grupo) | **IMPORTAR/ADAPTAR** |
| Motorista | Não existe | Sim (papel `driver`) | **IMPORTAR/ADAPTAR** |
| Fornecedor | Não existe | Sim (`suppliers`, ligado a paradas) | **IMPORTAR/ADAPTAR** |
| Veículo de operação turística | Não existe (o único "Vehicle" que existiu era KeroCar/OBD2, removido — não confundir) | Sim (`vehicles`, capacidade, conflito de agenda) | **IMPORTAR como novo domínio turístico — nunca reintroduzir nome/conceito KeroCar** |
| Grupo/saída/parada/operação | Parcial (`Trip` cobre "saída operacional"; **não há** "Grupo" como entidade nem "parada"/"stop" com progresso) | Sim, completo (`groups`, `stops`+`stopProgress`, conflito veículo/guia/motorista) | **FUNDIR** — Trip absorve o conceito de saída; Group/Stop são genuinamente novos |
| Reserva/Proposta/Pagamento/Comissão | **Já existe, mais maduro** no oficial (máquina de estados testada, RLS, Gate financeiro genérico, idempotência de estorno já corrigida como bug real) | Existe (booking state machine própria, Stripe real desligado, comissão bps) | **MANTER o oficial como base** — só Grupo 2 (regras/fórmulas específicas, ex. cálculo de comissão) e Grupo 3 (UX/fluxo) da 0.4.11 valem a pena revisar |
| QR/check-in/embarque | **Não existe** | Sim, completo e testado logicamente (token 192 bits, hash-only, idempotente, allowlist de origem no frontend) | **IMPORTAR com hardening** — é o pacote mais "pronto para portar" tecnicamente de toda a entrega |
| Mapas/GPS | **Não existe** | Sim (GPS real + mapa SVG próprio, sem provedor de mapas terceiro) | **IMPORTAR capacidade** — decidir se mantém o SVG próprio (zero custo de API de mapas) ou migra para um provedor real; respeitar consentimento (já existe no Valter) |
| Offline/PWA | **Não existe** (nenhum manifest/SW em `apps/web`) | Sim, real porém limitado (SW network-first do shell, IndexedDB opt-in, sem fila de escrita offline) | **IMPORTAR seletivamente** — é honestamente um MVP de offline, não uma solução completa; documentar a mesma limitação se portado |
| Comissões/premiações | Comissão de Booking já existe (mais madura, com Gate); premiação/recompensa por meta **não existe** | Ambos existem, mais simples | **FUNDIR** comissão (usar o Commission oficial como base), **IMPORTAR** premiação/campanha de meta |
| Ouvidoria/suporte | **Não existe** | Sim (`cases`, avaliação, moderação, score interno) | **IMPORTAR sem duplicar Inbox/CRM** — Inbox oficial já existe para conversa; ouvidoria é um fluxo distinto (reclamação/elogio formal, não mensagem) |
| Conteúdo/publicidade interna | O site GSAP oficial já tem conteúdo editorial embutido (não é CMS) | Igual (JS hardcoded, sem CMS) | **AVALIAR** — nenhum dos dois lados tem CMS real; se vier a ser construído, é trabalho novo em ambos os casos, nunca copiar um por cima do outro |
| i18n PT/EN/ES/FR | O oficial tem só locale de **mercado** (moeda/fuso, BR+PT) — **zero tradução de string de UI** | Tem tradução de UI completa nos 4 idiomas (dicionário estático) | **REAPROVEITAR TERMINOLOGIA/CATÁLOGO** — a Fase 3 do roadmap oficial ("tradução texto/áudio") está marcada como "construir do zero"; o dicionário chave→tradução do Valter é um ponto de partida real de conteúdo (nunca de arquitetura — next-intl/i18next é o caminho recomendado para o motor oficial) |
| Firebase Auth/Firestore | **Não existe** (auth é JWT+bcrypt próprio) | É a fundação inteira do backend | **NÃO ADOTAR como fundação** — mandato explícito; útil só como referência de fluxo (ex. auto-bootstrap do primeiro admin, verificação de e-mail confirmado) |
| PHP como stack principal | N/A | É a stack toda | **NÃO REAPROVEITAR** — mandato explícito |
| Layout visual da 0.4.11 | Oficial já tem 2 visuais próprios (dashboard `apps/web` em Tailwind + site GSAP) | Visual ad-hoc, CSS sem design system | **NÃO IMPORTAR** — mandato explícito, reforçado pelo achado de que o CSS do Valter nem segue um sistema de tokens consistente para copiar mesmo que quisesse |

---

## 8. Matriz mestre por recurso (Tabela mestre, itens de maior valor — ver Tabela A acima para cobertura completa por domínio)

| Recurso | Origem 0.4.11 | Equivalente oficial | Decisão | Regra a preservar | Destino | Schema impact | RLS/RBAC/Audit/Gate | Layout impact | Help key | Testes | Evidência |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Parceiro + comissão de indicação | `Bookings.php::reserve`, `Support.php::commission`, `Platform.php::EDITABLE` (código PM##) | Nenhum | **IMPORTAR/ADAPTAR** | Comissão trava `rateBps` no momento da reserva (nunca reescreve histórico ao mudar taxa global); código `PM{papel}{agência}{seq}` | Novo model `Partner` (Prisma) + integração com `Commission` existente | Sim — novo model + FK em `Booking`/`Commission` | RLS obrigatório (mesma disciplina de todo model novo); Audit em toda mutação; sem Gate extra além do já existente em Commission | Zero (nova tela dentro do padrão Tailwind/shadcn existente) | `parceiros`, `parceiros/[id]` | Unit (cálculo comissão) + integration (isolamento tenant) + E2E (indicação→booking→comissão) | `Bookings.php` linha ~20, `Support.php` linha 26 |
| Guia/Motorista/Fornecedor/Veículo | `Records.php` (EDITABLE), `Operations.php::saveGroup` | Nenhum | **IMPORTAR/ADAPTAR** | Validação de conflito de agenda (veículo/guia/motorista sobrepostos por data) antes de salvar Group | 4 models novos + relação com novo `Group`/`Trip` | Sim | RLS obrigatório em todos | Zero | `equipe`, `veiculos`, `fornecedores` | Unit (detecção de conflito) + integration | `Operations.php::saveGroup` |
| Grupo operacional + Parada (stop) | `Operations.php`, `Records.php` | `Trip` (parcial — sem Group nem Stop) | **FUNDIR** | 1 Trip pode ter N Bookings (já provado no oficial) — Group deveria mapear para isso, nunca reintroduzir uma segunda hierarquia paralela | Novo model `Stop`/`TripGroup` FK em `Trip` existente | Sim | RLS obrigatório | Zero | `viagens/[id]` (aba nova) | Integration (relação Trip↔Group↔Stop) | `TripItineraryDay`/`TripActivity` (schema.prisma:1536+) já são quase isso — avaliar fusão antes de criar Stop do zero |
| QR check-in/chegada/embarque | `Operations.php::createQr/arrive/board` | Nenhum | **IMPORTAR com hardening** | Token 192 bits, só hash persistido, expira 24h, idempotente, allowlist de origem no cliente | Novo model `ArrivalSession`/`Arrival`/`Boarding` FK em `Booking`/`Traveler` | Sim | RLS + Audit obrigatórios; avaliar Gate se check-in liberar algo financeiro | Zero (tela mobile-first nova, dentro do design system) | `checkin` | Security (token não-previsível, replay, expiração) + integration | `Operations.php` linha ~13 (createQr), `qr.js` (allowlist de origem) |
| GPS tracking + mapa | `Experience.php::tracking`, `travel-map.js` | Nenhum | **IMPORTAR capacidade, respeitando consentimento** | Só ativa após check-in de chegada; decimação de pontos acima de 4000; consentimento explícito antes de rastrear | Novo model `TrackingPoint` FK em `Booking`/`Traveler` | Sim | RLS + Audit; nunca sem consentimento registrado | Zero se reaproveitar componente de mapa existente do design system; **REQUER DECISÃO DE LAYOUT** se precisar de tela nova de mapa — avaliar antes de construir | `minha-viagem` (área do viajante, já autorizada como próximo bloco) | Security (consentimento, privacidade) + integration | `Experience.php` linha 13 |
| Gate financeiro 3-etapas com fingerprint anti-alteração | `Services.php::createGate/approveGate/executeGate` | `Gate` (schema.prisma:451) — genérico, já usado em Payment/Commission | **REAPROVEITAR LÓGICA (Grupo 2)** | Verificar registro-alvo não mudou entre aprovação e execução (`subjectFingerprint`) | Avaliar se acrescentar fingerprint check ao `Gate` oficial existente | Não (é reforço de lógica existente, não novo model) | Já é RLS/Audit — avaliar se falta o fingerprint check | Zero | — | Unit (fingerprint muda → gate recusa execução) | `Services.php` — ver §6 |
| i18n de UI (catálogo de strings PT/EN/ES/FR) | `i18n.js`, `translations-extra.js` | Não existe (só locale de mercado) | **REAPROVEITAR terminologia/catálogo, nunca a arquitetura** | Dicionário chave=texto-PT é frágil (chave muda se o texto em PT mudar) — recomendação: migrar para chaves abstratas (`next-intl`) usando o CONTEÚDO do dicionário Valter como ponto de partida de tradução, não a arquitetura | Fase F3 do roadmap oficial (ainda não iniciada) | Não (é conteúdo, não schema) | N/A | **REQUER DECISÃO DE LAYOUT** se acrescentar seletor de idioma visível — parar esse item específico até decisão do fundador | Cada rota final | — | `i18n.js`, `translations-extra.js`, `editorial-translations.js` |
| Offline/PWA (app-shell) | `sw.js`, `offline.js`, `manifest.webmanifest` | Não existe | **IMPORTAR seletivamente após auditoria de cache** | Network-first (nunca cache-first) — prioriza sempre versão nova; offline é só leitura de viagem previamente salva, nunca escrita | Área do Viajante (já autorizada como próximo bloco) | Não | N/A | Zero se aplicado à Área do Viajante nova (ainda não tem layout a proteger) | `minha-viagem` | E2E (viagem salva → fica offline → app funciona) | `sw.js`, `offline.js` |

---

## 9. Grupos de reaproveitamento (síntese)

**Grupo 1 — Reaproveitamento direto:** **nenhum item.** Stacks incompatíveis (PHP↔TypeScript, Firestore↔PostgreSQL) tornam cópia direta de código estruturalmente impossível — confirma a decisão já tomada no mandato de nunca copiar diretórios inteiros.

**Grupo 2 — Reaproveitar lógica:** cálculo de comissão (basis points, half-up), Gate financeiro com fingerprint anti-alteração, geração/validação de token QR (192 bits, hash-only), decimação de pontos GPS, allowlist de origem para QR escaneado, invariantes de validação de `routes` (nights/durations consistentes com cities), rate-limit de endpoint público de lead.

**Grupo 3 — Reaproveitar funcionalidade/UX funcional:** jornada completa do parceiro (indicação→comissão→resgate de recompensa por meta), fluxo de convite de passageiro por token com expiração de 7 dias, fluxo de check-in→chegada→embarque como 3 eventos distintos (nunca inferir um do outro), degradação graciosa do site público quando o catálogo/backend falha (nunca derrubar o site editorial inteiro por erro de banco), separação entre "fechamento do pacote" e "recebimento" (não são o mesmo evento).

**Grupo 4 — Não reaproveitar:** todo o backend PHP em si (arquitetura), Firebase/Firestore como banco, frontend vanilla JS/CSS em si (design), autenticação Firebase (o oficial já tem JWT+bcrypt+RBAC testado e mais robusto), e-mail hardcoded do proprietário no código-fonte, qualquer texto/preço/depoimento de `editorial-data.js` (fictício, mesma ressalva que o próprio site GSAP oficial já tem sobre seus próprios textos não-comprovados).

---

## 10. Lista "não perder nada" — recursos exclusivos úteis da 0.4.11

1. Domínio completo de Parceiro com código PM## e comissão de indicação (rastreável, versionada).
2. Domínio de Guia/Motorista/Fornecedor/Veículo de excursão com detecção de conflito de agenda.
3. QR check-in de chegada com separação explícita chegada≠embarque.
4. GPS tracking do viajante com geofencing cultural (mostra curiosidade ao entrar num raio de interesse).
5. Recompensas de parceiro por meta de campanha (distinto de comissão).
6. Ouvidoria/reclamação formal com moderação e score interno.
7. Mapa SVG próprio sem dependência de provedor pago de mapas (Mercator manual + dados OSM/Natural Earth locais).
8. Catálogo completo de strings de UI traduzidas em 4 idiomas (conteúdo, reaproveitável mesmo trocando a arquitetura de i18n).
9. Fluxo de convite de passageiro (responsável cadastra, convidado reivindica por token+e-mail).
10. Distinção "fechamento do pacote" ≠ "recebimento" ≠ "confirmação" como 3 eventos financeiros/operacionais separados.
11. Gate financeiro com verificação de fingerprint do registro-alvo entre aprovação e execução.
12. PWA/offline funcional (mesmo que limitado) para consulta de roteiro sem internet.

## 11. Regressões se a arquitetura do Valter substituísse a oficial (nunca vai acontecer, mas documentado por exigência do mandato)

| Capacidade | Oficial | Valter | Risco se substituído |
|---|---|---|---|
| RLS/isolamento multi-tenant | Postgres RLS real, fail-closed, testado (`tenant-isolation.test.ts`) | Isolamento só por lógica de aplicação (`agencies/{a}` no path), sem RLS de banco — Firestore rules negam acesso direto mas não isolam entre agências no nível do banco | **Alto** — perderia isolamento fail-closed real |
| SecretProvider | Camada dedicada, nunca texto plano, nunca logs | Segredos em variáveis de ambiente/config file (`config.php`), sem abstração de criptografia por segredo | **Médio** — perderia rotação/versionamento de segredo |
| Gates/Audit genéricos | Modelo único reaproveitado por todo domínio sensível | Gates só cobre financeiro (Services.php); Audit é uma coleção Firestore simples | **Médio** — perderia generalização |
| Cost Control | Camada dedicada de medição→limite→alerta→bloqueio para IA | Não existe (0.4.11 não tem nenhuma feature de IA) | **N/A** neste domínio |
| Tool Broker / Agent Grants | Default-deny, registro de ferramentas de agente IA | Não existe | **N/A** |
| Job/Execution Engine | Fila real com `SKIP LOCKED`, lease/heartbeat, retry/dead-letter testado sob carga | Fila própria em `Jobs.php`, lease de 120s, backoff — real mas nunca testado sob concorrência real (sem os testes do pacote) | **Médio** — perderia garantia testada de "nunca duplo processamento" |
| Attribution | UTM+gclid+fbclid capturado na mesma transação do Contact/Lead | Não existe (0.4.11 não tem tracking de marketing) | **N/A** |
| Testes automatizados | 49 arquivos, incluindo isolamento negativo | Testes existiam nos protótipos mas **não estão no pacote entregue** | **Alto** — nenhuma suíte reproduzível hoje |

## 12. Rotas finais e Help System — estado atual (matriz completa exige PM-CONV-05; abaixo, o inventário real do que existe HOJE)

| Rota (oficial, hoje) | Papel | Help key proposta | Locales |
|---|---|---|---|
| `/` | público | `home` | PT-BR, PT-PT, EN, ES, FR |
| `/login` | público | `auth.login` | idem |
| `/selecionar-empresa` | autenticado multi-tenant | `auth.selecionar-empresa` | idem |
| `/trocar-senha` | autenticado | `auth.trocar-senha` | idem |
| `/dashboard` | autenticado | `dashboard` | idem |
| `/leads`, `/leads/[id]` | Vendas/Admin | `crm.leads`, `crm.lead-detalhe` | idem |
| `/viagens`, `/viagens/[id]` | Admin/Operação | `trips.lista`, `trips.detalhe` | idem |
| `/inbox` | Atendimento | `inbox` | idem |
| `/gates` | Admin | `gates` | idem |
| `/custos` | Admin | `custos` | idem |
| `/jobs` | Admin | `jobs` | idem |
| `/canais` | Admin | `canais` | idem |
| `/documentos` | Admin | `documentos` | idem |
| `/politica-comercial` | Admin | `politica-comercial` | idem |

**Rotas NOVAS que PM-CONV-03+ deve criar** (não inventar keys específicas agora — cada bloco de implementação define as suas ao nascer, conforme regra "Página nova sem helpKey = NÃO CONCLUÍDA"): parceiros, equipe (guia/motorista), veículos, fornecedores, grupos/saídas, check-in/QR, área do viajante (mapa/GPS/offline).

## 13. Bloqueadores de produção (lista objetiva)

| Bloqueador | Risco | Fase | Critério de resolução |
|---|---|---|---|
| Git não inicializado no repo oficial | Alto (nenhum histórico, nenhum rollback seguro) | Antes de PM-CONV-03 | `git init` + primeiro commit — decisão do fundador, não técnica |
| Nenhum gateway de pagamento real conectado (oficial) | Alto para operação comercial real | PM-CONV-07 | Autorização + credencial explícitas do fundador |
| WhatsApp (WABA) não homologado em número real | Médio | Antes de operação real | Homologação Meta em conta de produção |
| Zero testes reproduzíveis do lado 0.4.11 (pacote entregue não inclui `tests/`) | Médio (qualquer lógica portada precisa de teste NOVO no oficial, nunca herdar "cobertura" que não existe mais) | PM-CONV-03+ | Escrever testes novos no oficial para cada regra importada, nunca assumir a cobertura antiga |
| Ausência de Partner/Guide/Driver/Vehicle/Group/QR no schema oficial | Alto (é o core do próximo bloco) | PM-CONV-03 | Modelagem Prisma + RLS + testes de isolamento |
| Upload real de documento de viagem (oficial) | Médio, já documentado como limitação conhecida | Fora do escopo desta rodada | Storage seguro privado/autenticado |
| Textos factuais não comprovados nos DOIS sites públicos (GSAP oficial e Valter) | Baixo técnico, alto reputacional | Antes de publicar qualquer um dos dois | Revisão do fundador |

## 14. Proposta de PM-CONV-03 (especificação, NÃO EXECUTAR)

**Escopo:** Core turístico — Partner, Guide, Driver, Vehicle, Group, Stop, QR check-in/arrival/boarding.

**Entidades novas propostas (Prisma):** `Partner` (código, comissão base, status), `Guide`/`Driver` (podem ser o mesmo model `TeamMember` com `tipo` enum, ou dois models — decisão de design a tomar no início do bloco, não aqui), `Vehicle` (nome, tipo, placa, capacidade — **nunca reaproveitar o nome/schema do KeroCar removido**), `TourGroup` (associando `Trip` existente a `Vehicle`+`Guide`+`Driver`+conjunto de `Booking`s), `Stop` (ligado a `TripItineraryDay` existente ou a `TourGroup`, decisão a avaliar — `TripItineraryDay`/`TripActivity` já cobrem parte disso), `ArrivalSession`/`Arrival`/`Boarding`.

**Migrations necessárias:** todas aditivas, cada uma com sua própria migration de RLS (mesmo padrão já usado nas 12 migrations de RLS existentes).

**Serviços:** `packages/db/src/partner.ts`, `guide-driver.ts` (ou nome final decidido), `vehicle.ts`, `tour-group.ts`, `checkin.ts` — mesmo padrão dos serviços existentes (`booking.ts`, `trip.ts`).

**Rotas/Server Actions:** `app/actions/partners.ts`, `team.ts`, `vehicles.ts`, `groups.ts`, `checkin.ts` — mesmo padrão.

**RBAC:** novas permissões (`parceiros.*`, `equipe.*`, `veiculos.*`, `grupos.*`, `checkin.*`) no catálogo existente (`packages/db/src/permissions.ts`).

**RLS:** obrigatório em todo model novo, migration dedicada por domínio (mesmo padrão já certificado).

**Audit/Gate:** toda mutação sensível (aprovar comissão de parceiro, autorizar recompensa) passa pelo `Gate` genérico já existente — nunca um segundo mecanismo de aprovação.

**Layout:** zero mudança em telas/componentes existentes — novas telas usam os componentes já existentes em `components/ui/` (badge, button, card, input, label) e o mesmo shell autenticado.

**Help:** cada rota nova nasce com `helpKey` (ver §12) — sem isso, a rota não está concluída pelo próprio critério do mandato.

**Testes:** unit (regras: conflito de agenda, código de parceiro, cálculo de comissão), integration (isolamento RLS de cada model novo), E2E (jornada indicação→booking→comissão; jornada check-in→embarque).

**Critério de saída:** domínio único (nunca duas fontes de verdade para o mesmo conceito), RLS/RBAC/Audit em tudo, testes e zero mudança visual — conforme o próprio roadmap do mandato (§8, tabela de blocos).

---

## 15. O que NÃO pude comprovar (transparência exigida pelo mandato)

- Não rodei nenhuma suíte de teste (nem oficial nem Valter) — contei arquivos, não casos individuais.
- Não tenho como reproduzir os números históricos de teste da 0.4.11 (244/244, 135/136 etc.) — os arquivos de teste que os produziriam não estão no pacote entregue.
- Não verifiquei ao vivo login Google/Firestore/Stripe/SMTP de nenhum dos dois lados — só o código estático.
- Não abri em detalhe `packages/db/src/i18n/format.ts`, `finance/country-pack-registry.ts`, nem os `tools/definitions/*.ts` do lado oficial (fora do escopo direto pedido, relevantes só se o próximo bloco tocar o agente IA "Yalla").
- Os 79 capítulos do manual operacional do Valter foram indexados pelo título (todos os headers lidos), não os 88 páginas de conteúdo lidas linha a linha — o suficiente para mapear área/rota, não para auditar cada campo de UI individualmente.

## 16. Veredito

**PM-CONV-02 CONCLUÍDO.**

Os dois projetos foram localizados fisicamente, auditados arquivo por arquivo no que é código real de aplicação (17 PHP + 24 JS/CSS/HTML do Valter; schema Prisma completo + estrutura de rotas/testes/RBAC/RLS do oficial), a documentação do Valter foi cruzada com o código real (com 3 discrepâncias documentadas — MemoryStore.php, pasta tests/, número de testes históricos — todas resolvidas a favor do código real, nunca da documentação), os 4 grupos de reaproveitamento foram preenchidos, a lista "não perder nada" tem 12 itens concretos, as regressões potenciais foram listadas, os bloqueadores de produção foram objetivamente enumerados, e a especificação do PM-CONV-03 está pronta — sem ter sido executada.

**Existe alguma programação estrutural conhecida ainda faltando para classificar o escopo desta rodada? NÃO.** Todo recurso relevante da 0.4.11 tem uma linha de decisão neste documento. As únicas lacunas são de VERIFICAÇÃO AO VIVO (login real, Stripe real, testes rodados) — nunca de classificação/rastreabilidade, que era o objetivo desta rodada.

---
*Relatório produzido por auditoria real de código nos dois projetos (nenhuma linha de código, schema, migration ou layout foi alterada). Aguardando autorização do fundador para PM-CONV-03.*
