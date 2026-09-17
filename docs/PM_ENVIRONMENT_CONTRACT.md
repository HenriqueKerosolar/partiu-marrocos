# Partiu Marrocos — Contrato de Variáveis de Ambiente

PM-PRE-GOLIVE-MASTER-01 §12. Levantamento exaustivo feito por grep direto em `apps/web/src` e `packages/db/src` por `process.env.*`, cruzado com `schema.prisma` (`env(...)`) e com o `.env.example` já existente no repositório (criado no PM-CONV-05, mantido atualizado desde então). Nenhum valor real é exposto aqui — só nomes, propósito e classificação.

## Classificação

- **REQUIRED_PRODUCTION** — sem isso, o app não sobe ou opera de forma insegura em produção.
- **OPTIONAL** — tem default seguro; só precisa ser setado para mudar comportamento.
- **PROVIDER_SPECIFIC** — só relevante quando/se um provider externo específico for conectado (ainda não é o caso).
- **DEVELOPMENT_ONLY** — nunca deve ser setado em produção; existe só para dev/test local.

## Tabela completa

| Variável | Classificação | Client/Server | Propósito | Onde obter |
|---|---|---|---|---|
| `DATABASE_URL` | REQUIRED_PRODUCTION | Server | Connection string do Postgres (pooled, via PgBouncer/equivalente do provider) — usada em runtime pela aplicação Prisma. Em serverless (Vercel), sem pool o app esgota conexões do Postgres rapidamente. | Provider de Postgres escolhido (item 3 do TODO humano) |
| `DIRECT_URL` | REQUIRED_PRODUCTION | Server (build/migrate) | Connection string direta (sem pooler) do MESMO banco — usada só por `prisma migrate deploy`, que não funciona de forma confiável através de um pooler de transação. | Mesmo provider, variante "direct"/"unpooled" |
| `JWT_SECRET` | REQUIRED_PRODUCTION | Server | Assina/valida o cookie de sessão (`jose`). Um valor fraco ou reaproveitado do dev compromete toda autenticação. | Gerar por ambiente: `openssl rand -base64 48` |
| `SECRET_PROVIDER` | REQUIRED_PRODUCTION | Server | Seleciona a implementação de `SecretProvider` (hoje só `"local"` existe — ver `packages/db/src/secret-provider.ts`). | Fixo: `"local"` |
| `SECRET_PROVIDER_MASTER_KEY` | REQUIRED_PRODUCTION | Server | Chave AES-256-GCM (32 bytes base64) que cifra segredos por tenant (ex.: WhatsApp app secret) em repouso no banco. Nunca reaproveitar a de dev. | Gerar por ambiente: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `SESSION_COOKIE_NAME` | OPTIONAL | Server | Nome do cookie de sessão httpOnly. Default seguro (`partiumarrocos_session`) já hardcoded como fallback em `apps/web/src/lib/session.ts` se ausente — mas o `.env.example` já traz o valor explícito, então manter setado. | Fixo por convenção |
| `PUBLIC_SITE_ORIGIN` | OPTIONAL | Server | Origem exata do site público estático (`site-original/`), usada em CORS por `apps/web/src/app/api/public/leads/route.ts`. Default `"*"` (aberto) se ausente — **trocar para o domínio real antes de publicar**, senão qualquer origem pode chamar o endpoint de captura de lead. | Domínio real do site público, definido quando o site for publicado |
| `NODE_ENV` | REQUIRED_PRODUCTION | Server | Padrão Next.js/Node — controla `secure` do cookie de sessão (`apps/web/src/app/api/auth/login/route.ts`) e otimizações de build. Vercel já define automaticamente (`production`/`preview`/`development`) — não precisa ser setado manualmente no dashboard. | Definido automaticamente pela Vercel |
| `WHATSAPP_GRAPH_BASE_URL` | DEVELOPMENT_ONLY | Server | Override da URL base da Meta Cloud API — usado **só** pelos testes de integração para apontar a um mock HTTP local (`apps/web/src/lib/whatsapp/cloud-api.ts:25`). Se definido em produção por engano, o app pararia de falar com a Cloud API real. **Nunca setar em produção.** | N/A — nunca setar fora de test/dev |

## Variáveis NÃO presentes no código atual (aguardando decisão externa, não inventadas)

Estas NÃO existem hoje em nenhum `.env`/schema — listadas aqui só para o usuário saber que aparecerão quando as respectivas integrações forem autorizadas (TODO humano):

- Credenciais de gateway de pagamento (Stripe/Mercado Pago/PIX) — item 1 do TODO humano.
- Credencial de auth serviço-a-serviço com o KeroMarketing (API key ou equivalente) — item 2.
- Credenciais de provider de tradução/voz (F3) — item 4.
- `WHATSAPP_APP_SECRET`/tokens de conta WhatsApp — **não são env vars**: já são segredos por tenant, cifrados via `SecretProvider` e armazenados no banco (`WhatsappAccount`), nunca em variável de ambiente — arquitetura já correta desde o PM-CONV-03.

## Notas de execução (Vercel)

- Os scripts `dev`/`build`/`start` de `apps/web/package.json` são todos envolvidos em `dotenv -e ../../.env -- next ...`. Testado empiricamente nesta rodada (`npx dotenv -e ../../nonexistent.env -- node -e "..."`): `dotenv-cli` **não falha** quando o arquivo `-e` não existe — apenas segue usando o `process.env` real do processo. Como a Vercel nunca envia um arquivo `.env` (injeta as variáveis nativamente no ambiente do build/runtime), os scripts funcionam sem alteração — **nenhuma mudança de código necessária aqui**.
- `packages/db/package.json` ganhou nesta rodada um script `"postinstall": "prisma generate"` (antes ausente — achado real de auditoria, ver `docs/PM_DEPLOY_READINESS.md`), garantindo que um `pnpm install` limpo (como o da Vercel) gere o Prisma Client automaticamente, sem depender de alguém ter rodado `prisma generate` manualmente antes.
