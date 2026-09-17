# Partiu Marrocos — Relatório Final de Qualidade

Consolida PM-CONV-07 a PM-CONV-12 (autorização PM-AUTONOMOUS-FINAL-v2). Todo achado abaixo vem de leitura direta de código/execução real — nada presumido.

## PROBLEMAS ENCONTRADOS

**CRITICAL: 0.**
**HIGH: 0.**

**MEDIUM (4, todos corrigidos):**
1. `sincronizarStatusPagamentoBooking`/`resumoPagamentoBooking`/estorno (Payment) comparavam valores monetários float diretamente — reproduzido com um caso real (R$2,55+R$2,56 ≠ R$5,11 em IEEE754) que travava um Booking pago integralmente em `PAGAMENTO_PARCIAL` para sempre.
2. `criarPayment` não validava a moeda do Payment contra a moeda da Proposal do Booking — risco de soma cross-moeda silenciosa (a soma em si já é protegida em `dashboard.ts`, mas não em `payment.ts`).
3. `/minha-viagem` (rota pública) sem rate limit, diferente de `/api/auth/login`/`/api/public/leads`.
4. Nenhum health check (`/api/health`) existia — zero observabilidade externa.

**LOW (4, todos corrigidos):**
1. `Commission` sem `idempotencyKey` (Payment/CostEvent já tinham).
2. `Trip.timezone` armazenado mas não usado na formatação de data em 3 telas (mostrado como texto solto, data formatada no fuso padrão).
3. `packages/db/prisma/rls.sql` (documentação cumulativa) desatualizado desde T6 — faltavam 24 tabelas (a proteção REAL em banco sempre esteve completa; só a referência estava velha).
4. Nenhum runbook de backup/restore/DR existia.

**INFORMATIVO (não corrigido, decisão registrada, não um bug):**
- 5 componentes formatam moeda com `Intl.NumberFormat("pt-BR", ...)` direto em vez do helper central `formatarMoeda` — sem impacto funcional hoje (nenhuma tela ainda expõe escolha de mercado), corrigir agora arriscaria quebrar o bundle do cliente por zero ganho comportamental.
- Webhook do WhatsApp sem rate limit — decisão explícita de não adicionar (o caminho caro já é protegido por HMAC; rate limit por IP arriscaria descartar tráfego legítimo da Meta).
- Rate limiter continua em memória/por instância — real sob múltiplas instâncias Vercel, correção adiada conscientemente pro mesmo rigor de stress-test que o Job Engine recebeu, não pra ser feita às pressas.

## CORRIGIDOS: 8/8 (todos os MEDIUM + LOW acima).
## NÃO CORRIGIDOS: 0 bugs — só decisões de escopo registradas (acima) e itens WAITING_EXTERNAL/HUMAN_DECISION_PENDING (ver TODO_HUMANO).
## EXTERNAMENTE BLOQUEADOS: gateway de pagamento real, KeroMarketing (integração de código), tradução/voz (F3), CountryPack fiscal/legal (BR/PT).

## TESTES

**PASSANDO: 625/625** (518 `packages/db` + 107 `apps/web`), verificado em **8 execuções completas isoladas** (4 por pacote) sem nenhuma falha.
**FALHANDO: 0.**
**FLAKY: 0** (uma instância de flakiness aparente foi investigada e determinada ser artefato de orquestração de teste — dois pacotes rodando simultaneamente contra o mesmo banco compartilhado — não um defeito do produto; ver `PM_CONV_12_RESULTADO_FINAL.md` para a análise completa).

## TYPECHECK / LINT / BUILD

Todos limpos — `tsc --noEmit` (2 pacotes), `next lint`, `next build` (35 rotas, sucesso).

## RLS

100% de cobertura confirmada — toda tabela `tenantId`-bearing (37 tabelas ao final da sessão) tem `FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` em migration própria, verificado uma a uma contra `schema.prisma`. Documentação de referência (`rls.sql`) atualizada para bater 1:1 com a proteção real.

## RBAC

Catálogo cresceu com `avaliacoes.view`/`avaliacoes.manage` (Post-Trip). Nenhuma regressão nos papéis existentes — `DEFAULT_ROLES` estendido de forma aditiva. Achado operacional registrado: permissão nova não se propaga automaticamente pra tenants já seedados (mecanismo correto, não um bug) — precisa de reseed ou concessão manual.

## AUDIT

3 novos tipos de evento: `AVALIACAO_REGISTRADA`, `DEPOIMENTO_PUBLICADO`, `DEPOIMENTO_DESPUBLICADO`. Confirmado (leitura direta) que toda mutação em `payment.ts`/`commission.ts`/`notifications.ts`/`post-trip.ts` chama `registrarEvento` — nenhuma mutação silenciosa.

## HELP / I18N

26/26 rotas com helpKey, 26/26 com conteúdo próprio nos 5 idiomas (PT-BR/PT-PT/EN/ES/FR) — 0 rotas staff sem Help, 0 sem locale completo.

## E2E

Jornada crítica completa (Lead→...→Dashboard/Central/Passageiro) passando, mais 2 ciclos completos novos testados (Notification a partir de pagamento real; Post-Trip do consentimento à publicação/despublicação, incluindo prova de integridade em banco).

## SECURITY

Auditoria completa (auth/sessão, CSRF/XSS, injeção SQL, webhook/HMAC, segredos em log, RLS, rate limiting) — 0 CRITICAL/HIGH. 2 gaps reais MEDIUM corrigidos (rate limit em `/minha-viagem`, health check). Ver `PM_CONV_11_RESULTADO.md` para o detalhe completo por item.

## PERFORMANCE

Sem mega-benchmark artificial (decisão explícita da autorização). Revisão de evidência real: polling do mapa já corrigido (PM-CONV-06), padrões `ON CONFLICT`/`SKIP LOCKED` corretos e stress-testados, nenhum N+1 óbvio nas consultas principais.

## PWA / MOBILE

Sem mudança nesta rodada além da validada no PM-CONV-06 (ícone PNG, service worker seguro). `/minha-viagem` ganhou avaliação pós-viagem, mesma credencial.

## GPS

Sem mudança nesta rodada — hardening já concluído no PM-CONV-06 (§5E, 22 execuções limpas de stress-test).

## YALLA

Auditado no PM-CONV-06 — real quando configurado, corretamente dormente neste ambiente (sem credencial). Sem mudança nesta rodada.

## FINANCE

2 bugs reais corrigidos (float rounding, moeda divergente), 1 gap fechado (Commission idempotency). Gateway real permanece HUMAN_DECISION_PENDING.

## MARKETING

KeroMarketing localizado (dentro do Ai DEV Orquestrador) e auditado com evidência — capacidades reais confirmadas (Google Ads/Meta Ads/GA4/Search Console/Website Intelligence read-only; Content&Social com publicação real só em provider de teste), mas **sem superfície de autenticação serviço-a-serviço** — bloqueio real que impede integração de código nesta rodada. Ver `PM_CONV_07_RESULTADO.md`.

## Veredito final

**PARTIU MARROCOS — CODE COMPLETE / EXTERNAL SETUP PENDING.**
