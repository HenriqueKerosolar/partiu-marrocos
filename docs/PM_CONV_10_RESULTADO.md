# PM-CONV-10 — Resultado: Fechamento Funcional

**Status: CONCLUÍDO nos dois itens reais confirmados como pendentes (Notifications Foundation, Post-Trip Foundation). PWA/offline já estava coberto no PM-CONV-06.**

## Auditoria prévia (não presumida)

Antes de construir, confirmei por leitura direta (`schema.prisma`, busca por `Notification`/`NPS`/`Testimonial`/`avaliacao`) que **nenhuma** das duas features existia — nem tabela, nem função, nem rota. `Traveler Area V1` (a terceira pendência historicamente listada, `docs/STATUS_COMPLETO_PARTIU_MARROCOS.md`) **já está construída** desde o PM-CONV-05 (`/minha-viagem`, credencial opaca, magic-link, zero ID previsível — exatamente a especificação original) e teve segurança reforçada no PM-CONV-06 (IDOR, TravelerCare leakage, rate limit no PM-CONV-11) — não precisou de trabalho novo aqui.

## Notifications Foundation

Domínio genérico novo (`Notification`, enum `NotificationChannel` com os 5 canais pedidos). Nasce com **IN_APP real** (zero credencial externa) e o contrato pronto pros outros 4:
- `IN_APP`: real, funcional — nova tabela, nova tela (`/notificacoes`), badge de não lidas no menu.
- `WHATSAPP`: reaproveitaria o Job Engine (T5) já real quando cabeado a um evento — não cabeado nesta rodada (nenhum evento explicitamente pediu esse canal ainda), mas a estrutura (enum, campo `canal`) já suporta sem migration nova.
- `EMAIL`/`PUSH`: **WAITING_EXTERNAL** — nenhum provider configurado neste ambiente, nunca simulado.

**Primeiro evento real cabeado**: pagamento recebido (`sincronizarStatusPagamentoBooking`, quando o Booking vira `PAGO`) notifica `Booking.responsavelId`, se houver um. Escolhido por ser o primeiro item da lista explícita do comando ("proposta enviada, pagamento, vencimento, documento pendente, viagem confirmada") com um ponto de código já bem entendido nesta mesma sessão (PM-CONV-08). Os outros 4 eventos da lista ficam como extensão natural, mesmo padrão, para quando priorizados.

**Segurança**: `marcarComoLida` sempre escopado ao próprio `destinatarioId` — testado explicitamente que outro usuário nunca marca a notificação de alguém. RLS aplicada (`notifications`, migration própria). Nenhuma permissão nova necessária — "minhas notificações" nunca depende de RBAC de negócio, só de identidade.

## Post-Trip Foundation

`TripReview` — avaliação (nota 1–5) + depoimento, sempre ligada a um `Booking` já `CONCLUIDA` (nunca durante a viagem, nunca sem pagamento — a máquina de estados do Booking já impede qualquer atalho). **Consentimento (`depoimentoAutorizado`) e publicação (`depoimentoPublicado`) são campos deliberadamente separados** — nunca a mesma ação, nunca automática. Isso é garantido em DOIS níveis, não só em código: a função `publicarDepoimento` recusa sem consentimento prévio, **e** uma CHECK constraint no banco (`NOT depoimento_publicado OR depoimento_autorizado`) torna impossível a linha existir no estado inválido mesmo por um caminho de escrita que não passe pela função — testado explicitamente com uma tentativa de `UPDATE` SQL direto, que falha.

**Quem avalia**: o próprio cliente, via a MESMA credencial de `/minha-viagem` (nunca um segundo token/sistema) — `registrarAvaliacaoPassageiro` revalida o token do zero a cada chamada, mesmo padrão de todo o resto do módulo passageiro. `podeAvaliar` (novo campo no contexto do passageiro) só é `true` quando a reserva está `CONCLUIDA` e ainda não existe avaliação — o formulário só aparece nessa janela.

**Quem publica**: só um humano da equipe, via nova tela `/avaliacoes` (`avaliacoes.manage`, Admin-only por padrão — mesma lógica de `premiacoes.manage`: decisão editorial/marketing, não operação comum). `avaliacoes.view` (Vendas/Atendimento/Admin) permite ver sem poder publicar.

## RBAC — achado operacional real (não um bug, registrado por transparência)

Adicionar `avaliacoes.view`/`avaliacoes.manage` ao catálogo de permissões **não concede automaticamente** a papéis (`Role`) já existentes em tenants já seedados — `RolePermission` só é gravado no momento do seed/criação do papel. Confirmado ao testar no navegador: o admin de desenvolvimento (seedado antes desta rodada) foi redirecionado de `/avaliacoes` até eu rodar `pnpm --filter @partiumarrocos/db exec tsx src/seed.ts` de novo (idempotente, só adiciona — `rolePermission.upsert`, nunca remove nada). **Isto é o comportamento correto e esperado do mecanismo** (Role é configurável por tenant, o catálogo global não deveria sobrescrever escolhas de um tenant que já revogou algo deliberadamente) — mas é um lembrete operacional real: toda vez que uma rodada futura adicionar uma permissão nova, tenants já existentes em produção vão precisar de uma ação explícita (reseed do papel padrão, ou o próprio admin do tenant concedendo a permissão em `/papeis`) — não é automático, documentado aqui pra não surpreender ninguém depois do deploy.

## Verificação

- `pnpm --filter @partiumarrocos/db exec tsc --noEmit` / `pnpm --filter web run typecheck` — limpos.
- `pnpm --filter @partiumarrocos/db test` (unit) + `test:integration` — 129/129 + 389/389 (era 125/375 no início da rodada — +14 novos: 6 Notifications, 8 Post-Trip).
- `pnpm --filter web test` — 107/107 (inalterado desta frente — a mudança nova aqui é só em `packages/db` + páginas simples de `apps/web`, sem lógica de teste unitário adicional necessária além do que os testes de integração de `packages/db` já cobrem via as Server Actions finas).
- `pnpm --filter web run lint` — limpo.
- Verificado no navegador real: `/notificacoes` e `/avaliacoes` renderizam sem erro de console, nav com badge de não lidas presente, RBAC redirecionando corretamente antes/depois do reseed.
- `HELP_ROUTES` cresceu de 24 para 26 — `notificacoes.overview` e `avaliacoes.overview`, ambas com conteúdo próprio nos 5 idiomas desde o primeiro commit (teste de cobertura completa de locale, já existente desde o PM-CONV-06, confirma automaticamente 26/26).

## Quantitativo

**Arquivos criados (11):** `packages/db/src/{notifications,post-trip}.ts`, `packages/db/prisma/migrations/{20260917020000_pm_conv_10_notifications,20260917020100_enable_rls_pm_conv_10_notifications,20260917030000_pm_conv_10_trip_reviews,20260917030100_enable_rls_pm_conv_10_trip_reviews}/`, `packages/db/tests/integration/pm-conv-10-{notifications,post-trip}.test.ts`, `apps/web/src/app/actions/{notifications,avaliacoes}.ts`, `apps/web/src/app/(app)/notificacoes/{page,notification-list}.tsx`, `apps/web/src/app/(app)/avaliacoes/{page,avaliacoes-list}.tsx`, `apps/web/src/app/minha-viagem/avaliacao-form.tsx`.
**Arquivos alterados:** `packages/db/prisma/schema.prisma` (2 models novos, 3 reverse relations), `packages/db/src/{payment,passageiro,permissions,index}.ts`, `packages/db/src/help/{registry,content}.ts`, `apps/web/src/app/actions/passageiro.ts`, `apps/web/src/app/minha-viagem/page.tsx`, `apps/web/src/app/(app)/layout.tsx`.
**Migrations novas:** 4 (todas aditivas, zero drift confirmado).
**RBAC novo:** `avaliacoes.view`/`avaliacoes.manage`. **RLS nova:** `notifications`, `trip_reviews`. **Audit novo:** `AVALIACAO_REGISTRADA`, `DEPOIMENTO_PUBLICADO`, `DEPOIMENTO_DESPUBLICADO`.
**HELP_ROUTES:** 24 → 26, ambas com cobertura completa nos 5 idiomas desde o início.

## Limitações (declaradas)

- Só 1 de 5 eventos da lista sugerida está cabeado em Notifications (pagamento recebido) — os outros 4 (proposta aceita, documento pendente, viagem confirmada, vencimento) ficam para quando priorizados, mesma estrutura, sem migration nova.
- Canal WHATSAPP de Notifications: estrutura pronta, nenhum evento cabeado a ele ainda.
- Canais EMAIL/PUSH: WAITING_EXTERNAL (sem provider configurado).
- PWA/offline já estava coberto (PM-CONV-06) — nada novo tocado aqui.
