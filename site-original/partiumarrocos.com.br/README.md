# PARTIU MARROCOS — A Viagem em Longa-Metragem

Site completo em linguagem cinematográfica. Animações: GSAP 3 + ScrollTrigger (via CDN cdnjs).

> Este é o site público estático — não faz parte do monorepo `packages/db`/`apps/web` (o CRM real). Vive aqui só como cópia de referência/trabalho; o original publicado é hospedado à parte (cPanel).

## Publicar (cPanel)
1. Copie `config.example.php` para `config.php` e troque a senha (nunca suba o `config.example.php` sozinho achando que já protege algo).
2. Envie **tudo** desta pasta (`index.html`, `mapa.html`, `admin.html`, `css/`, `js/`, `img/`, `.htaccess`, `save.php`, `upload.php`, `check-pass.php`, `_lib.php`, `config.php`) para `public_html`. **Não** suba nada que estiver fora desta pasta (ex.: a pasta irmã `_nao-publicar/`, se existir — sobras de trabalho, nunca vão para produção).
3. Confirme que `.htaccess` foi enviado e está ativo (bloqueia acesso HTTP direto a `config.php`/`_lib.php`/pasta `.rl/`) — a maioria das hospedagens cPanel já roda Apache com isso habilitado por padrão.

## Configurar
- **WhatsApp**: em `js/data.js`, dentro de `PM_DEFAULTS.config.whatsapp` (ou pelo próprio painel `admin.html`, aba "Geral & contatos") → coloque o número real (só dígitos, com DDI 55). Hoje é um placeholder (`5599999999999`) — **não há conta WhatsApp Business real configurada ainda**, ver `PLANO-MESTRE-EXECUCAO.md` do CRM.
- **Integração com o CRM (captura de lead)**: mesma aba do painel, campos "URL base do CRM" (`config.apiBase`) e "Identificador do tenant" (`config.tenantSlug`, já vem `partiu-marrocos`). Com isso preenchido, o formulário de orçamento grava o lead de verdade no CRM (`POST /api/public/leads`) antes de abrir o WhatsApp — se ficar vazio ou o CRM estiver fora do ar, o formulário continua funcionando normalmente, só não grava o lead. O CRM precisa da env var `PUBLIC_SITE_ORIGIN` apontando pro domínio real deste site (CORS) — ver `.env.example` na raiz do monorepo.
- **Senha do painel admin**: só em `config.php`, no servidor — nunca mais fica hardcoded em nenhum `.js`/`.php` versionado, nem guardada no navegador. Rate limit de 8 tentativas erradas / 10 min por IP em `save.php`/`upload.php`/`check-pass.php`.
- **Upload de imagem pelo painel**: aceita jpg/png/webp/gif. **SVG não é aceito** (upload de SVG sem sanitização é um vetor conhecido de XSS armazenado) — se precisar mesmo de um SVG, suba manualmente por FTP/cPanel para `img/`, já revisado.
- **Equipe**: em index.html, seção "CENA 13 · O ELENCO" → troque "Seu nome aqui" / "Nome do guia" / "Nome do time".
- **Instagram/Facebook**: nos créditos finais, troque os `href="#"`.
- **Vídeo teaser**: quando tiver o vídeo real, o cartão da CENA 10 pode apontar para o YouTube.
- **Textos factuais** (números, avaliações, afirmações geográficas): revisar/validar antes de publicar — não comprovados na cópia original.

## O que tem
Cold open 3-2-1 · letterbox com timecode 24fps e claquete por cena · barra de progresso do filme · hero com título por letra + parallax · trailer com texto palavra a palavra · 7 motivos (takes) · filmstrip horizontal pinada com 8 cenários clicáveis · fichas técnicas dos 11 destinos (modal com navegação) · rota SVG que se desenha no scroll com contador de km · storyboard dia a dia dos 3 roteiros (5/8/12 dias) · pôsteres de cinema com inclusões e preços · 9 experiências · 8 pratos + marquee · tour panorâmico com arraste (6 cenas) · vídeo · 9 curiosidades · depoimentos como críticas ★★★★★ · elenco/equipe · FAQ completo (8) · cultura Amazigh com contadores · formulário de orçamento completo → grava lead no CRM e depois abre o WhatsApp · créditos finais · chatbot Yalla (15 temas + atalhos, respostas fixas — **não é o agente Yalla real do CRM**, é conteúdo decorativo do site; ver limitação abaixo).

Acessível: prefers-reduced-motion respeitado, navegação por teclado nos modais (Esc, ← →).

## Limitações conhecidas (deliberadas nesta rodada)
- O chatbot "Yalla" deste site é só um FAQ por palavra-chave, local, sem IA — nunca fala com o Tool Broker/Cost Control do CRM real. Conectar os dois (chat público anônimo → agente real) é uma decisão de escopo maior (exposição de custo de IA a tráfego anônimo, abuso/spam) — não incluída aqui, precisa de autorização própria.
- A pasta `cinema/` e as tools `admin.html`/`save.php`/`upload.php` ainda dependem de hospedagem com PHP (cPanel típico serve). Não fazem parte do stack Next.js/Postgres do CRM.
