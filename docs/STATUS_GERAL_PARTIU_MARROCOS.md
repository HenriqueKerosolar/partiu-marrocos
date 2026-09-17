# Partiu Marrocos — O que está pronto e o que falta

Status consolidado em 15/09/2026. Cobre os dois projetos que existem hoje: o **CRM real** (monorepo `packages/db` + `apps/web`) e o **site público** estático (`site-original/partiumarrocos.com.br`).

---

## 1. CRM — o que está PRONTO

### Base da plataforma (Tenant Core, Auth, RBAC, Governança)
- Multi-tenant com **RLS fail-closed** em toda tabela com `tenant_id` (isolamento testado em todos os domínios).
- Autenticação por sessão (cookie httpOnly), papéis/permissões configuráveis por tenant (`Role`/`Permission`/`RolePermission`), troca de senha obrigatória no primeiro acesso.
- **Gates** (aprovação humana para ações sensíveis), **Audit Log** append-only, **SecretProvider** (nenhuma credencial em texto plano), **Cost Control**, **Tool Broker** (registry default-deny de ferramentas do agente), **Job Engine** (fila assíncrona real: claim atômico, retry/backoff, dead-letter, idempotência, auditoria).

### CRM comercial
- **Leads/Pipeline/Contatos/Conversas** com funil configurável.
- **Lead scoring determinístico** + **Next Best Action** (recomendação, nunca execução automática).
- **Atribuição de marketing (T6)**: captura de UTM/gclid/fbclid/landing page/referrer.
- **Propostas comerciais reais e versionadas** (rascunho → enviada → aceita/recusada), com **Política Comercial configurável por tenant** (limiares de desconto — não mais hardcoded).
- **Repescagem estruturada** de leads (nunca envia mensagem sozinha sem elegibilidade real).
- **i18n** (fundação PT-BR/PT-PT).

### Operação de venda (construído nesta rodada — PM-NIGHT-RUN-02)
- **Booking** — reserva comercial real, distinta da Proposal, com máquina de estados e passageiros (`Traveler`).
- **Payment** — domínio de pagamento **provider-neutro** (modo manual/offline; nenhum gateway real conectado), parcelamento, estorno sempre via Gate financeiro com idempotência real.
- **Finance Core Real** — `Commission` promovida a tabela real (com Gate de pagamento); `Receivable` como consulta computada sobre `Payment` (sem duplicar dado); Política Comercial tenant-configurável confirmada ponta a ponta.
- **Travel Document** — requisito de documento (catálogo por tenant) separado do documento entregue por passageiro; 6 estados; alertas de pendência/vencimento via Job Engine (sinaliza internamente, nunca envia WhatsApp sozinho). **Upload real de arquivo não existe** (ver seção 2).
- **Trip Operation** — separação real entre reserva comercial (Booking) e execução operacional da viagem (Trip); relação **1 Trip : N Bookings** (provada, não presumida); itinerário dia a dia, atividades (com marcação visível/interno), checklist operacional por categoria.

### Qualidade técnica atual
- **468 testes automatizados passando** (364 em `packages/db` + 104 em `apps/web`), incluindo testes negativos de isolamento multi-tenant em todos os domínios sensíveis.
- **39 migrations** aplicadas, 100% aditivas (nenhuma migration destrutiva na base atual).
- Typecheck e build de produção limpos (21 rotas em `apps/web`).
- Git ainda não inicializado neste repositório (decisão pendente do fundador, não técnica).

### Site público — integração com o CRM
- O formulário de orçamento do site (`site-original/partiumarrocos.com.br`) já grava lead de verdade no CRM antes de abrir o WhatsApp (`POST /api/public/leads`) — testado ponta a ponta nesta sessão, `apiBase` apontado para o CRM local.

---

## 2. CRM — o que FALTA

### Autorizado, ainda não construído (próximos blocos da sequência em andamento)
| Bloco | O que é |
|---|---|
| **Traveler Area V1** | Área do cliente final (fora do CRM) pra consultar a própria viagem — itinerário, status, pendências de documento — com autenticação segura (link mágico com token expirável, não um ID previsível). |
| **Notifications Foundation** | Domínio genérico de notificação (IN_APP/EMAIL/WHATSAPP/PUSH/WEBHOOK) para os eventos já existentes (proposta, pagamento, vencimento, documento, viagem confirmada). |
| **Post-Trip Foundation** | Pós-viagem: follow-up, avaliação/NPS, depoimento **com consentimento explícito** (nunca publicação automática), nova oportunidade/indicação. |

Depois desses três blocos, a autorização atual determina **parada obrigatória** para reavaliação do fundador — não é uma lacuna, é um limite deliberado.

### Limitações técnicas já conhecidas e documentadas (não escondidas)
- **Upload real de documento de viagem não existe** — só metadata/status. Falta storage seguro (privado, autenticado, validação de tipo/tamanho) antes de implementar.
- **Nenhum gateway de pagamento real conectado** — todo pagamento é registrado manualmente hoje (modo offline). Conectar um gateway real precisa de autorização e credencial explícitas.
- **Nenhuma emissão fiscal** — Country Pack Portugal/Brasil ainda não existem; nenhuma regra fiscal concreta foi implementada (proibido nesta fase).
- **WhatsApp Business (WABA) não homologado em conta real** — a integração existe tecnicamente, mas não foi validada em produção.

### Explicitamente fora de escopo até nova autorização do fundador
Router multi-modelo de IA (T4), Voz/ElevenLabs (F3), Conectores de Marketing (F4), Command Center (F5), Country Packs fiscais (F6), ERP completo, Supplier Engine completo, app mobile nativo.

### Decisão de infraestrutura pendente
- Repositório Git ainda não inicializado — decisão do fundador, não técnica.

---

## 3. Site público (`partiumarrocos.com.br`) — o que está PRONTO

Site estático completo, em linguagem cinematográfica (GSAP + ScrollTrigger): abertura, hero, trailer, 7 motivos, filmstrip de 8 cenários, fichas técnicas de 11 destinos, rota SVG animada, 3 roteiros (5/8/12 dias) com storyboard, pôsteres de preço, 9 experiências, gastronomia, tour panorâmico, 9 curiosidades, depoimentos, elenco/equipe, FAQ (8), cultura Amazigh, formulário de orçamento (**já grava lead no CRM**), painel admin próprio (`admin.html`) com autenticação e upload de imagem seguro (sem SVG), acessibilidade (`prefers-reduced-motion`, navegação por teclado).

## Site público — o que FALTA

Tudo abaixo é **conteúdo real**, não código — e depende de informação que só você tem. Nada disso foi inventado:

| Item | Onde | Status atual |
|---|---|---|
| Número de WhatsApp real | `js/data.js` | placeholder `5599999999999` |
| Nomes da equipe | `index.html`, seção "O Elenco" | placeholders ("Seu nome aqui" etc.) |
| Instagram / Facebook | créditos finais | `href="#"` |
| Vídeo teaser | seção "Cena 10" | sem link de YouTube |
| Textos factuais (números, avaliações ★★★★★, afirmações geográficas) | várias seções | não comprovados na cópia original — revisar antes de publicar |
| Senha do painel admin em produção | `config.php` (servidor) | precisa ser configurada no cPanel real, nunca versionada |
| `PUBLIC_SITE_ORIGIN` / `apiBase` em produção | `.env` do CRM / `js/data.js` | hoje aponta só para `localhost` (ambiente de teste) — precisa dos domínios reais quando o CRM for hospedado publicamente |

---

## Resumo em uma frase

O **motor do CRM** (reserva → pagamento → comissão → documento → operação da viagem) está construído, testado e funcionando de ponta a ponta em ambiente local; o que falta nessa frente são os três blocos já autorizados (Área do Viajante, Notificações, Pós-viagem) e depois uma pausa para sua decisão sobre o que vem a seguir. O **site público** está pronto no código; o que falta nele é só preencher com dados reais do negócio (WhatsApp, equipe, redes sociais, vídeo) quando você tiver.
