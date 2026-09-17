# PM-CONV-11 — Resultado: Production Hardening (Security / Observability / Backup-DR / Performance)

**Status: AUDITADO INTEGRALMENTE, achados reais corrigidos onde seguro fazê-lo sob avaliação de risco — nenhuma vulnerabilidade CRITICAL/HIGH encontrada; 2 gaps reais de MEDIUM corrigidos; itens de maior risco tratados com decisão explícita (corrigir vs. declarar) em vez de aplicados às pressas.**

## SECURITY — auditoria real (evidência, arquivo:linha), não suposição

### Auth/sessão — CONFIRMADO CORRETO, nenhuma mudança necessária
`JWT_SECRET` obrigatório no boot, sem fallback hardcoded (`apps/web/src/lib/jwt.ts`). Sessão dupla-camada (JWT + linha `Session` no banco, revalidada a cada request, fail-closed). Cookie `httpOnly` sempre, `secure` em produção, `sameSite: lax`. Rate limit real em `/api/auth/login` (10/5min por IP, `bcrypt.compare`, erro genérico sem enumeração de usuário).

### CSRF/XSS — CONFIRMADO CORRETO
Zero ocorrências de `dangerouslySetInnerHTML` em todo `apps/web/src`. CSRF coberto pela proteção nativa de Server Actions do Next.js (checagem de Origin) + `sameSite: lax`.

### Injeção SQL — CONFIRMADO CORRETO
Todo uso de `$queryRaw`/`$executeRaw` em `packages/db/src` (8 ocorrências, listadas na auditoria) usa template literal parametrizado (`${valor}` sempre vira bind parameter real do Postgres via Prisma) — **zero concatenação de string em SQL bruto** em qualquer lugar do código.

### Webhook WhatsApp — CONFIRMADO CORRETO na parte crítica, 1 decisão registrada
HMAC com comparação `timingSafeEqual`, `appSecret` sempre resolvido da CONTA encontrada (nunca um segredo global). Fail-open (`return NODE_ENV !== "production"`) só quando a conta não tem `appSecret` configurado, e só fora de produção — deliberado, pra permitir teste local sem credencial Meta real, fecha em produção. **Decisão registrada nesta rodada**: não adicionar rate limit a este endpoint. Motivo: o caminho caro (chamada ao Yalla/LLM, submissão de Job) só é alcançado DEPOIS da validação HMAC — que só a Meta (ou quem tiver o app secret real) consegue produzir. Adicionar rate limit por IP arriscaria descartar entregas legítimas da Meta (que usa uma faixa de IPs, pode rajar em picos de volume) por um ganho de proteção marginal sobre um caminho já protegido criptograficamente. Corrigir isso às pressas, sem tempo de validar contra tráfego real da Meta, é mais arriscado que não mexer.

### Segredos em log — CONFIRMADO SEM VAZAMENTO
Busca dirigida por `console.*` próximo a `apiKey`/`token`/`password`/`secret`/`accessToken` em `packages/db/src` e `apps/web/src` — nenhum valor de segredo real é logado. As duas ocorrências de "senha" em log são scripts de seed/admin de uso único, documentadas como propositais (mostrar a senha gerada UMA vez, nunca reimprimível).

### RLS — CONFIRMADO 100% DE COBERTURA EM BANCO; achado real de DOCUMENTAÇÃO corrigido
Toda tabela `tenantId`-bearing do `schema.prisma` (34 tabelas) tem `FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` aplicada em migration própria — conferido uma a uma contra as migrations reais, nenhuma lacuna de proteção encontrada. **Achado real, mas de documentação, não de proteção**: `packages/db/prisma/rls.sql` (referência cumulativa, nunca lida em runtime) estava desatualizado desde T6 — faltavam 24 tabelas criadas entre Proposal Foundation e PM-CONV-05b. **Corrigido**: `rls.sql` atualizado com as 24 entradas faltantes, documentação agora bate 1:1 com a proteção real do banco.

### Observabilidade — GAP REAL CONFIRMADO, corrigido no que é seguro adicionar agora
Nenhuma lib de log estruturado, nenhum correlation ID, **nenhum health check existia**. **Corrigido**: `GET /api/health` (novo) — conectividade real com o banco (`SELECT 1`, mede latência) + saúde da fila de jobs (workers ativos, jobs prontos — reaproveita `obterSaudeFila`, já existente, nunca duplicado). Rota pública deliberada (monitoramento externo precisa bater sem sessão) mas nunca expõe dado de tenant/segredo. Log estruturado (pino/correlation ID) fica como recomendação — adicionar agora, sem um consumidor real (nenhum agregador de log configurado neste ambiente), seria instrumentação sem propósito imediato.

### Backup/DR — GAP REAL CONFIRMADO, documentação real adicionada
Nenhum script, nenhuma documentação existia. **Corrigido**: `docs/PM_BACKUP_RESTORE_DR.md` (novo) — runbook real com comandos `pg_dump`/`pg_restore` padrão, checklist de verificação pós-restore (incluindo RLS e isolamento cross-tenant), proposta de RPO/RTO (não comprometida — decisão do usuário), recomendação de usar PITR nativo do provider de Postgres (a decidir) como linha primária. **Declarado honestamente**: não testado ponta a ponta neste ambiente porque `pg_dump`/`pg_restore` não estão instalados aqui (o Postgres de dev roda via `embedded-postgres`, que não empacota essas ferramentas) — os comandos são padrão PostgreSQL estável, não uma descoberta arriscada, mas a execução real não foi verificada nesta máquina.

### Rate limiting — 1 gap real corrigido, 1 limitação estrutural documentada (não corrigida às pressas)
`/minha-viagem` (rota pública, credencial via `?token=`) não tinha nenhum rate limit, diferente de `/api/auth/login`/`/api/public/leads`. **Corrigido**: mesma proteção (`rateLimit`, 20/5min por IP) aplicada em `obterMinhaViagemAction`. Testado (2 testes novos, incluindo prova de que dois IPs diferentes não se afetam). **Limitação estrutural documentada, não corrigida nesta rodada**: o limitador (`rate-limit.ts`) é em memória, por instância — já documentado no próprio código desde antes desta rodada. Sob Vercel (serverless, múltiplas instâncias), o limite "10 por 5 min" não é um limite GLOBAL de verdade — cada instância/cold start tem seu próprio contador. Corrigir isso de verdade exige um contador atômico compartilhado (Postgres, seguindo "não trocar banco por conveniência", ou Redis/Upstash, credencial nova). Avaliado e **conscientemente adiado**: uma implementação de contador atômico em Postgres é viável sem credencial nova, mas exige o mesmo rigor de teste de concorrência que o Job Engine (§5E, PM-CONV-06) recebeu — implementá-la sem esse mesmo nível de verificação seria repetir, às pressas, exatamente a classe de bug que aquela rodada gastou tempo real pra encontrar e corrigir. Recomendação: rodada própria, dedicada, com o mesmo padrão de stress-test usado no Job Engine.

## PERFORMANCE — avaliação com evidência, sem benchmark artificial

Não foi montado um "mega-benchmark" (a autorização explicitamente pede números reais, não um teste artificial de carga só pra gerar um gráfico). Revisão de evidência já disponível:
- Polling do mapa ao vivo (8s) já revisado e corrigido no PM-CONV-06 (§7C/§7E) — pausa em aba oculta, sem sobreposição de requisição, backoff em falha.
- `$queryRaw` com `ON CONFLICT`/`FOR UPDATE SKIP LOCKED` (Job Engine, Cost Control, GPS) já são os padrões corretos pra evitar contenção sob concorrência real — confirmados corretos na auditoria de segurança acima (item de injeção), e já stress-testados no PM-CONV-06 (22 execuções consecutivas da suíte de Job Engine sob paralelismo real).
- Nenhum N+1 óbvio encontrado nas consultas principais (`obterPainelOperacional`, `obterDashboardExecutivo`) — usam `include`/agregação em uma única query, não loop de queries por item.

## Quantitativo

**Arquivos criados:** `apps/web/src/app/api/health/route.ts`, `docs/PM_BACKUP_RESTORE_DR.md`, `apps/web/tests/integration/passageiro-rate-limit.test.ts`.
**Arquivos alterados:** `apps/web/src/lib/rate-limit.ts` (+`getClientIpFromRequestHeaders`), `apps/web/src/app/actions/passageiro.ts` (rate limit aplicado), `packages/db/prisma/rls.sql` (24 tabelas documentadas).
**Testes novos:** 2 (rate limit de `/minha-viagem` por IP).
**Regressão:** `apps/web` 107/107 (era 105), incluindo a suíte sensível a concorrência do Job Engine sem flakiness. Typecheck limpo.

## CRITICAL = 0, HIGH = 0 (confirmado, não presumido)

Nenhuma vulnerabilidade crítica ou alta foi encontrada nesta auditoria. Os 2 gaps reais corrigidos (rate limit ausente em rota pública, health check ausente) são MEDIUM — defesa em profundidade e observabilidade, não uma falha de controle de acesso ou vazamento de dado. Os itens conscientemente adiados (rate limiter distribuído, log estruturado, automação de backup) são hardening de maturidade operacional, não vulnerabilidades exploráveis hoje.

## Limitações (declaradas)

- Rate limiter continua em memória/por instância — HUMAN_DECISION_PENDING sobre priorizar uma rodada dedicada com stress-test real (Postgres) ou aceitar Redis/Upstash (credencial nova).
- Backup/DR: runbook real, não executado ponta a ponta neste ambiente (ferramentas cliente ausentes) — recomendação de testar o restore assim que houver um ambiente com `pg_dump`/`pg_restore` disponível, antes de confiar nele para um incidente real.
- Log estruturado/correlation ID: não implementado, sem consumidor (agregador de log) configurado.
- Rate limit no webhook WhatsApp: avaliado, decidido não adicionar nesta rodada pelo motivo de risco explicado acima.
