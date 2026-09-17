# Documento de Fundação — Partiu Marrocos / KeroMind

Consolida: o que o site atual já tem, o que a especificação (`v4_cliente`) exige, o que já existe pronto em `C:\Projetos` e `D:\Projetos` e pode ser reaproveitado, e o que precisa ser construído do zero. Objetivo: começar a construir sem redescobrir o que a casa já resolveu.

## 1. Ponto de partida técnico já auditado

- **Site atual** (`partiumarrocos.com.br.zip`): HTML/CSS/JS estático, ~2.400 linhas. Conteúdo centralizado em `js/data.js`. Formulário só abre WhatsApp (não grava lead). Chatbot Yalla é keyword-matching local, sem CRM. Painel admin com senha fixa (`partiu2030`) hardcoded em `save.php`/`upload.php`/`admin.js` — inclusive um "trocar senha" no painel que só grava em `localStorage` e não protege nada de verdade. Upload aceita SVG sem sanitização. Um ZIP de trabalho antigo (`partiu-marrocos-cinema-WIP (1).zip`) ficou dentro do pacote entregue — não pode subir pro `public_html` assim.
- **Especificação** (`Partiu_Marrocos_Auditoria_Especificacao_KeroMind_v4_cliente.docx`, e a v5 recebida depois pelo Departamento Comercial): 27 seções cobrindo CRM, atendimento multilíngue com voz (ElevenLabs), i18n (país/idioma/moeda/fuso), financeiro/fiscal multi-país (Country Packs), marketing/mídia por país, Command Center executivo, operação pós-venda, segurança/governança. Roadmap próprio já definido na seção 21 (Fase 0 a 6).

## 2. Fundação técnica — não começar do zero

A descoberta mais importante desta auditoria: **já existe um esqueleto multi-tenant funcionando e testado**, em `D:\Projetos\CongaOne` — outro produto da casa (plataforma para comunidades religiosas), construído seguindo literalmente o mesmo padrão que definimos para o ecossistema Kero* (`PADRAO-DESENVOLVIMENTO-KEROMIND.md`). Ele é mais novo e mais alinhado ao padrão do que qualquer coisa em `C:\Projetos`.

**`D:\Projetos\CongaOne\packages\db`** — reaproveitar como ponto de partida literal:
- `tenant-db.ts` + `prisma/rls.sql` — isolamento por tenant via Row Level Security **fail-closed** no Postgres, com `current_tenant_id()` e `rls_bypass()`, uma única role de banco.
- `tests/integration/tenant-isolation.test.ts` — prova automatizada de que não vaza dado entre tenants (não é promessa, é testado).
- `cross-tenant.ts`, `permissions.ts` — regras de acesso cross-tenant e permissão.
- Monorepo pnpm (`apps/web`, `packages/db`, `packages/config`) com Next.js + Prisma + Tailwind/shadcn — exatamente o padrão definido.

Isso resolve, de cara, o item mais caro de qualquer plataforma multi-empresa: isolamento de dado entre clientes, testado. Partiu Marrocos entraria como o primeiro tenant "de verdade" pagando pra validar essa fundação — ao lado do CongáOne.

## 3. Mapa de reaproveitamento por necessidade do documento

| Necessidade (seção do v4) | Reaproveitar de | O quê exatamente |
|---|---|---|
| Isolamento multi-tenant (seção 12) | **CongaOne** `packages/db` | `tenant-db.ts`, `rls.sql`, testes de isolamento |
| Autenticação real + RBAC (seção 12, bloqueador crítico) | **fabricaease** | `jwt.ts`, `session.ts`, `rbac.ts`, `roles.ts` — cookie httpOnly, troca de senha forçada |
| CRM / funil de lead (seção 6) | **KeroSolar CRM** | `Lead`, `Pipeline`+`Stage`, `Conversation`/`Message`, `Task`, `Note` |
| WhatsApp (seção 8, 19) | **KeroSolar CRM** / **fabricaease** | API oficial Cloud API (não Baileys), webhook com verificação HMAC |
| Orquestração de IA + governança (seção 20) | **Ai DEV Orquestrador** | router multi-provider com failover, Tool Broker com gate de aprovação humana |
| Marketing/BI por canal (seção 9, 10) | **Ai DEV Orquestrador** | orquestradores prontos de GA4, Search Console, Google Ads, Meta Ads, atribuição |
| Agendamento/booking (seção 19.3) | **KeroIA Estética** | modelo `Agendamento` (também já herdado pelo CongaOne) |
| Financeiro básico (seção 18, antes do motor fiscal completo) | **KeroIA Estética** / **MercadoEase** (`legacy-checkease`) | `Caixa`, `Pagamento`, `Despesa`; billing e fechamento mensal reais |
| Conector com PDV/ERP do cliente (se necessário) | **db-connector-base** | pacote já consolidado, 4 engines, somente leitura por construção |
| Instalador desktop (se necessário) | **CheckEase-Desktop** / **DataEase** | receita Electron + electron-builder (NSIS) já shipada |

## 4. O que não existe em lugar nenhum da casa — construir do zero

- Internacionalização real: idioma / moeda / fuso / país por mercado (nenhum projeto tem — todos são BRL/PT-BR mono-país)
- Tradução e síntese de voz (ElevenLabs) — zero ocorrências em qualquer projeto auditado
- Lead scoring / Next Best Action
- Motor fiscal multi-país (Country Packs) — o que existe é fiscal mono-Brasil
- Tudo que é específico de turismo: roteiro, pacote, destino, storyboard de viagem (fica o que já existe no site atual como conteúdo/UX de referência)

## 5. Riscos herdados do site atual que bloqueiam início de produção

1. Senha admin hardcoded — reescrever com o padrão fabricaease, não corrigir localmente.
2. Upload de SVG sem sanitização.
3. Lead perdido — form abre WhatsApp sem gravar no CRM antes.
4. ZIP de trabalho (`partiu-marrocos-cinema-WIP`) não pode ir pro deploy.
5. Textos factuais não comprovados na cópia do site (números, avaliações, afirmações geográficas) — validar antes de publicar.

## 6. Fases (herdadas da seção 21 do v4, ajustadas ao que já existe pronto)

| Fase | Objetivo | Acelerado por já existir |
|---|---|---|
| 0 — Bloqueadores | Segurança admin/upload, captura de lead, revisão factual | fabricaease (auth), padrão de lead do KeroSolar CRM |
| 1 — Lançamento comercial | CRM integrado, WhatsApp, tracking, SEO base | KeroSolar CRM + fabricaease |
| 2 — Portugal | i18n, moeda, fuso | **nada pronto — construir do zero** |
| 3 — Atendimento internacional | Tradução texto/áudio, ElevenLabs | **nada pronto — construir do zero** |
| 4 — Marketing KeroMind | Ads, comentários, atribuição | Ai DEV Orquestrador (GA4/Ads já orquestrados) |
| 5 — Command Center | Briefing, scoring, NBA | Ai DEV Orquestrador (parcial — falta scoring/NBA) |
| 6 — Escala SaaS | Multiempresa, novos países | CongaOne `packages/db` (multi-tenant já testado) |

## 7. Próximo passo recomendado

Fundação técnica = fork/inicialização do monorepo no padrão do CongaOne (`packages/db` com RLS) + porte do módulo de auth do fabricaease + porte do modelo de CRM/WhatsApp do KeroSolar CRM. Isso cobre a Fase 0 e boa parte da Fase 1 sem escrever isolamento multi-tenant, auth ou CRM do zero. i18n, voz e fiscal internacional (Fases 2–3) são o trabalho genuinamente novo do projeto.
