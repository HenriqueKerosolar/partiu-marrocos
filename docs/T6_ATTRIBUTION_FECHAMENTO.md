# T6 — Attribution — Relatório de Fechamento

Etapa 1 de 5 de PM-NIGHT-RUN-01. Base: `RELATORIO-RECONCILIACAO-PM-CODE-HANDOFF-001.md`, `docs/PM_SANEAMENTO_01_FECHAMENTO.md`, `docs/PM_CRM_FIN_ARCH_01.md` (não refeitos do zero).

## 1. Objetivo

Capturar e persistir atribuição de marketing (UTM/gclid/fbclid/landing page/referrer) no fluxo real de captura pública de lead, em formato consultável (não Json solto), sem quebrar a regra crítica "lead persiste antes do WhatsApp".

## 2. Estado inicial

`Lead.origem`/`Contact.origem` eram strings livres sem estrutura de atribuição. Zero captura de UTM/gclid/fbclid confirmada em qualquer ponto do código (Relatório de Reconciliação). Site público já integrado a `POST /api/public/leads` desde a rodada anterior.

## 3. Arquivos analisados

`packages/db/prisma/schema.prisma` (models Contact/Lead), `apps/web/src/app/api/public/leads/route.ts`, `site-original/partiumarrocos.com.br/js/{data.js,cinema.js}`, `apps/web/src/app/(app)/leads/page.tsx`.

## 4. Arquitetura

Decisão de modelagem (seção 7 da autorização — "não escolher Json apenas para evitar modelagem"): **entidade dedicada** `AttributionTouch` (tenant-scoped, RLS), não campos soltos em `Lead` nem Json. Colunas indexadas (`source`, `campaign`, `contactId`, `leadId`) — suporta diretamente `GROUP BY` pra "leads por source/campaign" sem tocar num blob.

`tipo: FIRST|LAST|CONVERSION` já modela multi-touch, mas **só `CONVERSION` é gravado** nesta rodada — capturar FIRST/LAST de verdade exige visitante/sessão persistente no site (cookie sobrevivendo a múltiplas visitas), que não existe e não foi construído aqui (a própria autorização diz "preparar posteriormente", não "implementar agora"). Documentado explicitamente no schema e no código, não escondido.

`leadId` nulável de propósito — hoje sempre preenchido (todo touch nesta rodada nasce junto com um Lead), mas a coluna já aceita um touch sem lead (quando FIRST touch existir antes de qualquer conversão).

## 5. Decisões

- Entidade dedicada, não Json (seção 7).
- Só CONVERSION touch nesta rodada (seções 1/7 — "preparar posteriormente" ≠ "implementar agora").
- Não sobrescrever firstTouch: trivialmente satisfeito (nada grava FIRST ainda, nada pra sobrescrever).
- Badge discreto no card do Kanban (`via {source} · {campaign}`), **sem** criar `/leads/[id]` — essa tela fica pra Etapa 3 (CRM Evolution), onde já está priorizada explicitamente, evitando duplicar trabalho entre etapas.
- Melhorias de baixo risco do CRM (`Lead.lossReason`/`prioridade`, `Note.type`/`Task.type`) **não implementadas** nesta etapa — a autorização já as atribui explicitamente à Etapa 3.

## 6. Implementação

- `packages/db/src/attribution.ts` (novo): `temAtribuicao` (pura), `registrarAttributionTouch` (recebe `tx`, sempre chamado DENTRO da mesma transação que cria Contact/Lead — atomicidade real, nunca lead órfão de atribuição), `contarLeadsPorAtribuicao` (prova de consulta analítica).
- `apps/web/src/app/api/public/leads/route.ts`: aceita campos opcionais de atribuição, sanitiza, grava na mesma transação.
- `site-original/.../js/cinema.js`: captura `utm_*`/`gclid`/`fbclid`/`landingPage`/`referrer` da URL uma vez na carga da página, envia junto no POST — nunca bloqueia o formulário se a captura falhar (`try/catch` silencioso).
- `apps/web/src/app/(app)/leads/page.tsx`: badge de atribuição no card, sem redesenho.

## 7. Migrations

2 novas, aditivas: `20260915010000_attribution_touch` (tabela + enum), `20260915010100_enable_rls_attribution_touch` (RLS). Nenhuma coluna existente alterada. `rls.sql` atualizado (achado registrado no caminho: RLS de T5 nunca tinha sido documentado nesse arquivo — corrigido só como nota, não como mudança funcional).

## 8. Segurança

- RLS testado: Tenant B não lê/escreve `AttributionTouch` do Tenant A (FK composta rejeita mesmo tentando forçar).
- Sanitização testada: valores longos truncados no tamanho máximo; string vazia/só espaço vira `null`; um payload tipo `<script>` grava como texto literal, nunca interpretado.
- Fluxo crítico preservado: lead é criado mesmo com atribuição ausente ou inválida (testado).

## 9. Testes

14 novos: 3 unitários (`temAtribuicao`), 8 integração (`packages/db/tests/integration/attribution.test.ts` — sanitização, RLS, IDOR, consulta analítica), 3 na rota (`public-leads-route.test.ts` — captura completa, ausência não grava linha vazia, atribuição inválida não bloqueia o lead).

## 10. Regressão

**288/288 passando** (203 em `packages/db`, 85 em `apps/web`) — 14 a mais que o baseline de 274.

## 11. Typecheck

Limpo nos dois pacotes.

## 12. Build

Limpo (`next build`, exit 0, 16 rotas — sem rota nova).

## 13. Dependências

Nenhuma nova.

## 14. Limitações

- Só CONVERSION touch — FIRST/LAST exigem visitante/sessão persistente (fora de escopo).
- `landingPage` é sempre a página atual no momento do envio (site de página única em scroll) — não necessariamente a primeira página que o visitante viu, já que não há rastreamento de sessão entre visitas.
- Análise "vendas por campaign"/CAC/ROAS depende de Finance Core com receita real (fora desta etapa) — só a contagem de leads foi provada.

## 15. Decisões humanas pendentes

Nenhuma nova. Lista das rodadas anteriores continua sem mudança.

## 16. Resultado

Verificado ponta a ponta no navegador real (não só teste automatizado): formulário do site com `?utm_source=google&utm_medium=cpc&utm_campaign=marrocos-2026&gclid=...` na URL → `POST /api/public/leads` → `AttributionTouch` gravado com os valores corretos, ligado ao Contact e ao Lead reais → confirmado direto no banco → WhatsApp abriu depois, na ordem certa.

## 17. Status

**GREEN.**

## 18. Próximo bloco autorizado

Etapa 2 — F2 Internacionalização Foundation.
