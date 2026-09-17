# Partiu Marrocos — Prontidão de Deploy (Vercel) + Checklists de Provider

PM-PRE-GOLIVE-MASTER-01 §11, §13, §14, §15. Tudo abaixo foi verificado por leitura direta de código/config nesta sessão — nada aqui foi assumido de memória ou de documentação externa desatualizada. Nenhum deploy foi feito, nenhuma conta/serviço foi criada.

---

## §11 — Prontidão técnica para Vercel

### Detecção de framework / build

- **Framework:** Next.js App Router (`apps/web`), detectável automaticamente pela Vercel (`next.config.mjs` presente).
- **Root Directory:** o projeto é um monorepo pnpm — no dashboard da Vercel, o "Root Directory" do projeto precisa ser `apps/web` (não a raiz do repo), com "Include files outside the root directory" habilitado (necessário porque `apps/web` depende de `packages/db` via `workspace:*`).
- **Install command:** `pnpm install` (padrão detectado via `packageManager: "pnpm@8.15.9"` no `package.json` raiz) — **sem mudança necessária**.
- **Build command:** `pnpm --filter web run build` (ou o padrão da Vercel para monorepo pnpm, que resolve automaticamente via `turbo`/workspace se configurado — como não há `turbo.json`, o comando de build explícito deve ser setado no dashboard).
- **Output directory:** `apps/web/.next` — padrão do Next.js, nenhuma customização em `next.config.mjs` que o altere. Não precisa ser setado manualmente se o Root Directory estiver correto.
- **Node version:** `engines.node: ">=20"` no `package.json` raiz — compatível com as versões de Node suportadas pela Vercel (20.x/22.x). Recomendação: fixar explicitamente Node 20.x no dashboard da Vercel para reprodutibilidade, já que `>=20` sozinho permite a Vercel escolher qualquer versão futura.

### Prisma Client em instalação limpa — achado real, corrigido nesta rodada

**Achado:** nenhum `postinstall` script existia em nenhum `package.json` do monorepo (root, `apps/web`, `packages/db`). O Prisma Client só era gerado porque eu rodei `npx prisma generate` manualmente dezenas de vezes ao longo da sessão após cada mudança de schema — isso é um gotcha conhecido de pnpm workspace + Prisma + Vercel: um `pnpm install` limpo (exatamente o que a Vercel faz a cada build) não gera o client automaticamente sem esse hook.
**Correção aplicada:** adicionado `"postinstall": "prisma generate"` a `packages/db/package.json`. Verificado: `pnpm --filter web run typecheck` permanece limpo após a mudança.

### Runtime das rotas de API

Auditadas as 8 rotas de API existentes (`apps/web/src/app/api/**/route.ts`):

| Rota | `runtime` declarado | Correto? |
|---|---|---|
| `/api/health` | `"nodejs"` | Sim — faz `SELECT 1` via Prisma, precisa de Node runtime |
| `/api/webhooks/whatsapp` | `"nodejs"` | Sim — usa Prisma, `SecretProvider`, Job Engine |
| `/api/public/leads` | `"nodejs"` | Sim — usa Prisma/transação |
| `/api/auth/login` | *(nenhum)* | OK — default do Next.js App Router para Route Handlers já é Node.js runtime (Edge é sempre opt-in explícito); usa `bcrypt`/Prisma, que exigem Node, então o default já é o correto. |
| `/api/auth/logout` | *(nenhum)* | OK, mesmo motivo — usa Prisma/sessão |
| `/api/auth/trocar-senha` | *(nenhum)* | OK, mesmo motivo |
| `/api/auth/selecionar-empresa` | *(nenhum)* | OK, mesmo motivo |
| `/api/gates/[id]/decidir` | *(nenhum)* | OK, mesmo motivo |

**Conclusão:** nenhuma rota roda em Edge Runtime, nenhuma precisa — todas usam Prisma direta ou indiretamente, incompatível com Edge. As 3 que declaram `runtime = "nodejs"` explicitamente o fazem porque também usam `dynamic = "force-dynamic"` junto (bypass de cache); as demais funcionam corretamente com o default implícito. **Nenhuma mudança necessária.**

O único lugar que roda em Edge é `apps/web/src/middleware.ts` — **por design**: usa `jose` (não Prisma) e é o único ponto do app que precisa rodar em Edge (intercepta toda request antes do roteamento). Já confirmado correto em auditoria anterior (comentário extenso no próprio arquivo referenciando um incidente real em projeto irmão como motivação do design).

### Variáveis de ambiente

Ver `docs/PM_ENVIRONMENT_CONTRACT.md` — contrato completo, já classificado.

### Prisma — pooling e `directUrl`

`packages/db/prisma/schema.prisma` já declara `url = env("DATABASE_URL")` e `directUrl = env("DIRECT_URL")` desde o PM-CONV-05 — preparado para qualquer provider Postgres compatível com Vercel (Neon, Supabase, RDS via proxy) sem mudança de schema. Nenhuma mudança necessária aqui; só falta a decisão de provider (TODO humano item 3).

### Cron / jobs em background — incompatibilidade arquitetural real, precisa de decisão de infraestrutura

**Achado:** `apps/web/src/scripts/job-worker.ts` é um processo `while(true)` de polling contínuo (fila do Job Engine, `SELECT...FOR UPDATE SKIP LOCKED` a cada 1s, heartbeat a cada 5s). O próprio arquivo já documenta explicitamente (comentário no topo, escrito durante o T5-FIX) que ele **precisa rodar como processo separado e supervisionado** (systemd/PM2/container) — e que sem ele, nenhuma mensagem de WhatsApp enfileirada é de fato enviada.

Isso é **estruturalmente incompatível** com o modelo serverless da Vercel: funções serverless têm timeout máximo (10s-800s dependendo do plano) e não existem para "ficar rodando" — cada invocação é efêmera. Um long-running poller não pode ser uma Vercel Function.

**Duas opções (decisão de infraestrutura, não de código — não escolhida aqui):**
1. **Host always-on separado** para rodar `pnpm --filter web worker` continuamente — ex.: um serviço pequeno (Railway/Render/Fly.io/VM) que só roda esse processo Node e se conecta ao mesmo Postgres de produção. Mínima mudança de código (zero — o worker já é standalone).
2. **Reestruturar para Vercel Cron** — um novo endpoint `GET /api/cron/drain-jobs` protegido (ex.: header secreto que só a própria Vercel Cron conhece), chamado periodicamente (ex.: a cada 1 minuto, limite mínimo do Vercel Cron no plano padrão) que reivindica e processa um lote limitado de jobs dentro do timeout da function, depois retorna. Mudança de código real: perde a garantia de latência sub-segundo do poller atual (webhook→resposta WhatsApp ficaria sujeito ao intervalo do cron), e exige lidar com jobs de longa duração sendo cortados no meio pelo timeout da function.

**Recomendação:** opção 1 para o go-live — preserva 100% do comportamento e latência já testados nesta sessão, menor risco, sem reescrever o Job Engine. Opção 2 fica como possível otimização de custo futura, não bloqueante.

### Webhooks

`/api/webhooks/whatsapp` já é `POST` público (validação HMAC própria via `assinaturaValida`, secret por tenant vindo do `SecretProvider` — nunca uma variável global), compatível com Vercel Functions sem mudança. Timeout default de Vercel Functions (10s no plano Hobby) é suficiente — o handler só enfileira o job, não processa a mensagem de forma síncrona (por isso o worker separado existe).

### Uploads

Nenhuma rota de upload de arquivo binário identificada no código atual (`grep` por `FormData`/`multipart`/`Blob` no server não retornou rotas de upload de arquivo — fora do escopo construído até aqui). Se um recurso de upload for adicionado no futuro (ex.: anexos de reserva, comprovantes), **não usar o filesystem local da function** (efêmero/read-only em produção Vercel) — vai precisar de um object storage (Vercel Blob, S3, R2) desde o design. Não é um bloqueio atual, é uma nota para desenvolvimento futuro.

### PWA / Service Worker

`apps/web/public/manifest.webmanifest` e `apps/web/public/sw.js` já existem e são servidos como arquivos estáticos — funcionam de forma idêntica em Vercel (CDN estática) e em dev local, nenhuma mudança necessária. Homologação funcional (instalabilidade, cache, atualização) coberta em `docs/PM_PRE_GOLIVE_MASTER_RESULTADO.md` §18-19.

### Health endpoint

`GET /api/health` já existe (`SELECT 1` no banco + `obterSaudeFila` do Job Engine), público, sem dado sensível — pronto para ser usado como health check pela Vercel ou por um monitor externo (ex.: verificação de uptime apontando pra essa rota).

---

## §13 — Checklist de prontidão Postgres de produção (comparável entre providers)

Nenhum provider é escolhido aqui — isto é um checklist neutro para avaliar qualquer opção (Neon/Supabase/RDS/outro) contra os requisitos reais do projeto:

- [ ] **Postgres vanilla ou compatível** — o projeto usa RLS nativo (`FORCE ROW LEVEL SECURITY`, `current_tenant_id()`) e SQL raw em alguns pontos (rate limiter, cost control, tool broker) — precisa ser Postgres real, não uma API compatível parcial.
- [ ] **Connection pooling compatível com serverless** (PgBouncer em modo transação, ou equivalente nativo do provider) — obrigatório: Vercel Functions abrem muitas conexões curtas, sem pool o Postgres esgota `max_connections` rapidamente.
- [ ] **Connection string "direct" separada** (sem pooler) — usada só por `prisma migrate deploy`; a maioria dos providers gerenciados já oferece as duas variantes.
- [ ] **Versão do Postgres** — 14+ (o schema não usa nenhum recurso exótico recente; 14+ é uma margem segura).
- [ ] **SSL obrigatório** na connection string (`sslmode=require` ou equivalente) — não negociável para produção.
- [ ] **Backup automático + PITR (point-in-time recovery)** nativo do provider — se disponível, torna `docs/PM_BACKUP_RESTORE_DR.md` um plano B em vez da linha primária de recuperação.
- [ ] **Limite de conexões simultâneas** compatível com o volume esperado de Vercel Functions concorrentes (varia por plano do provider — checar antes de assinar).
- [ ] **Região** próxima à região de deploy da Vercel escolhida (minimiza latência de toda query).
- [ ] **Suporte a `pg_dump`/`pg_restore` padrão** ou snapshot equivalente exportável — para não ficar preso ao mecanismo proprietário de um único provider.
- [ ] **Preço em função de conexões/storage/compute** compatível com o estágio atual do produto (não superdimensionar para tráfego que ainda não existe).

## §14 — Checklist de prontidão para gateway de pagamento

Nenhum provider é conectado aqui — o domínio `Payment` (`packages/db/src/payment.ts`) já é provider-neutral, testado (idempotência, sincronização com `Booking`, estorno via Gate, e nesta rodada: comparação monetária sem erro de ponto flutuante via `money.ts`, e rejeição de moeda divergente). Checklist para quando um provider for escolhido:

- [ ] **Webhook de confirmação assíncrona** — o provider notifica de forma assíncrona (igual ao padrão já usado para WhatsApp) — nunca confiar só na resposta síncrona do "criar cobrança" como confirmação de pagamento.
- [ ] **Validação de assinatura do webhook** — mesmo padrão já aplicado ao webhook do WhatsApp (`assinaturaValida`) — todo provider de pagamento sério assina seus webhooks (Stripe: `Stripe-Signature`; Mercado Pago: `x-signature`).
- [ ] **Idempotência na criação de cobrança** — `criarPayment` já valida moeda e usa os helpers de `money.ts`; ao integrar um provider real, a chamada de criação de cobrança no provider externo precisa de uma idempotency key própria (a maioria dos providers suporta nativamente) para nunca duplicar cobrança em caso de retry de rede.
- [ ] **Mapeamento de estados** — o provider terá seus próprios estados (ex.: `pending`/`approved`/`rejected`/`refunded` no Mercado Pago) — precisam ser mapeados explicitamente para os estados já existentes de `Payment`, nunca assumidos 1:1.
- [ ] **Segredos do provider via `SecretProvider`** — mesmo padrão já usado para credenciais de WhatsApp por tenant (cifrado em repouso, nunca em variável de ambiente global) — cada tenant pode ter sua própria conta/credencial do gateway.
- [ ] **Estorno via Gate** — a infraestrutura de aprovação (`Gate`) já existe e já é usada para estorno manual; a integração com o provider real deve chamar a API de estorno do provider só depois do Gate aprovar, nunca antes.
- [ ] **Sandbox/teste do provider antes de produção** — todo provider sério oferece ambiente de teste; usar antes de qualquer credencial de produção.

## §15 — Especificação de autenticação serviço-a-serviço (proposta, para o time do KeroMarketing/Ai DEV Orquestrador)

Documento formal proposto — a implementação real é responsabilidade do time do Ai DEV Orquestrador (repositório externo, fora desta autorização). Objetivo: permitir que o Partiu Marrocos chame as capacidades já reais do KeroMarketing (Ads read-only, GA4/Search Console/Website Intelligence, Content&Social) sem depender de sessão de usuário humano.

### Mecanismo proposto

- **API key por tenant/aplicação**, não por usuário — análogo ao padrão já usado internamente pelo Partiu Marrocos para o `SecretProvider` (segredo opaco, cifrado em repouso do lado que o armazena, nunca em texto puro em log/erro).
- **Transporte:** header `Authorization: Bearer <api-key>` em toda chamada — nunca query string (vaza em logs de acesso/proxy).
- **Escopo:** a chave deve carregar um `tenantId`/`accountId` do KeroMarketing associado explicitamente — nunca uma chave "global" que enxergue todos os tenants do KeroMarketing.
- **Rate limiting no lado do KeroMarketing** — mesmo princípio já aplicado no Partiu Marrocos (`verificarLimiteTaxa`, novo rate limiter Postgres-atômico desta rodada) — por chave, não só por IP, já que chamadas serviço-a-serviço não têm IP variável de usuário final.
- **Auditoria:** toda chamada autenticada por essa API key deve gerar um evento auditável do lado do KeroMarketing (análogo a `registrarEvento` do Partiu Marrocos) — quem (qual chave/tenant), o quê, quando.
- **Revogação e rotação:** a chave deve poder ser revogada instantaneamente (sem esperar expiração) e rotacionada sem downtime (aceitar a chave antiga e a nova simultaneamente por uma janela curta durante a rotação).
- **Alternativa equivalente:** OAuth2 client-credentials grant, se o KeroMarketing já tiver infraestrutura OAuth — resolve os mesmos requisitos de escopo/revogação/auditoria por outro mecanismo padrão; a escolha entre API key simples e OAuth client-credentials é do time responsável, não uma exigência desta especificação.

### Fora de escopo desta especificação

Implementação real, nome de header/variável definitivo, formato exato da chave — tudo isso é decisão do time do Ai DEV Orquestrador. Esta especificação documenta só os requisitos funcionais de segurança que o mecanismo escolhido precisa satisfazer para o Partiu Marrocos poder integrar com confiança.

---

## Resumo — nenhuma ação aqui envolveu deploy, criação de conta ou serviço externo

Todo o trabalho deste documento foi leitura de código/config existente, uma correção de código local (`postinstall`), e documentação/checklists. Nenhum domínio foi comprado, nenhuma conta de provider foi criada, nenhum deploy público foi feito — todos os itens que dependem disso permanecem no `docs/PM_TODO_HUMANO_FINAL.md`.
