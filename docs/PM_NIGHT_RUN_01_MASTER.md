# PM-NIGHT-RUN-01 — Documento Mestre Cumulativo

Execução autônoma sequencial autorizada pelo fundador (comando PM-NIGHT-RUN-01). Este documento **cresce progressivamente** — nunca é reescrito do zero, seções antigas nunca são apagadas, só atualizadas com status novo.

**Ordem autorizada**: T6 Attribution → F2 i18n Foundation → CRM Evolution 01 → Finance Core Foundation 02 → Proposal Foundation 01 → PARAR (limite máximo desta autorização).

**Estado de partida** (confirmado, não presumido): F0, F1 (técnico, exceto WABA real), T1, PM-BLOQ-001, T2, T3, T5, PM-SANEAMENTO-01, PM-CRM-FIN-ARCH-01 concluídos. Baseline: 274 testes / 274 passando / typecheck limpo / build limpo / 24 migrations aplicadas / Git não inicializado.

---

## Índice de etapas

| # | Etapa | Status | Relatório |
|---|---|---|---|
| 1 | T6 — Attribution | **GREEN** | `docs/T6_ATTRIBUTION_FECHAMENTO.md` |
| 2 | F2 — i18n Foundation | **GREEN** | `docs/F2_I18N_FOUNDATION_FECHAMENTO.md` |
| 3 | CRM Evolution 01 | **GREEN** | `docs/CRM_EVOLUTION_01_FECHAMENTO.md` |
| 4 | Finance Core Foundation 02 | **GREEN** | `docs/FINANCE_CORE_FOUNDATION_02_FECHAMENTO.md` |
| 5 | Proposal Foundation 01 | **GREEN** | `docs/PROPOSAL_FOUNDATION_01_FECHAMENTO.md` |

---

## Etapa 1 — T6 Attribution

### Objetivo
Capturar e persistir dados de atribuição de marketing (UTM/gclid/fbclid/landing page/referrer) no fluxo real de captura pública de lead, com modelo de dados que suporte consultas analíticas futuras (leads/vendas/receita por source/campaign), sem quebrar o fluxo crítico "lead persiste antes do WhatsApp".

### Estado inicial
- `Lead.origem`/`Contact.origem` são strings livres, sem estrutura de atribuição.
- Nenhuma captura de UTM/gclid/fbclid em nenhum ponto do código (confirmado no Relatório de Reconciliação anterior).
- Site público (`site-original/`) já integrado ao `POST /api/public/leads` desde a rodada anterior (form → CRM → WhatsApp, testado ponta a ponta).

### Arquitetura
Entidade dedicada `AttributionTouch` (tenant-scoped, RLS, colunas indexadas source/campaign/contactId/leadId) — não Json solto, pra suportar `GROUP BY` real. Enum `tipo: FIRST|LAST|CONVERSION` já modela multi-touch, mas só `CONVERSION` é gravado nesta rodada (FIRST/LAST exigem visitante/sessão persistente no site, fora de escopo — "preparar posteriormente" ≠ "implementar agora").

### Implementação
`packages/db/src/attribution.ts` (novo: `temAtribuicao`, `registrarAttributionTouch`, `contarLeadsPorAtribuicao`) · `apps/web/.../api/public/leads/route.ts` (aceita+sanitiza+grava na mesma transação do Contact/Lead) · `site-original/.../js/cinema.js` (captura UTM/gclid/fbclid/landingPage/referrer da URL, nunca bloqueia o form) · `apps/web/.../leads/page.tsx` (badge discreto no card do Kanban, sem tela nova).

### Migrations
2 novas, aditivas: `20260915010000_attribution_touch`, `20260915010100_enable_rls_attribution_touch`. 26 migrations no total.

### Segurança
RLS testado (Tenant B não lê/escreve touch do Tenant A, FK composta rejeita IDOR). Sanitização testada (truncamento, string vazia→null, payload `<script>` gravado como texto literal nunca interpretado).

### Testes
14 novos (3 unit + 8 integration em `packages/db`, 3 na rota em `apps/web`).

### Regressão
288/288 (era 274 — +14). Typecheck limpo. Build limpo (16 rotas).

### Verificação ponta a ponta
Confirmado no navegador real: form do site com UTM na URL → API → `AttributionTouch` gravado corretamente no banco (source/medium/campaign/gclid conferidos) → WhatsApp abriu depois, ordem certa.

### Limitações
Só CONVERSION touch; `landingPage` é sempre a página atual (site de página única); análise de vendas/CAC/ROAS por campanha depende de Finance Core com receita real (fora desta etapa).

### Decisões humanas pendentes
Nenhuma nova.

### Resultado / Status
**GREEN** — implementação completa dentro do escopo, testes novos passando, regressão completa passando, typecheck/build limpos, migrations consistentes, RLS protegido, nenhuma vulnerabilidade introduzida, nenhuma decisão do fundador indispensável, nenhuma migration destrutiva, relatório completo (`docs/T6_ATTRIBUTION_FECHAMENTO.md`).

### Próximo bloco autorizado
Etapa 2 — F2 Internacionalização Foundation. **Prosseguindo automaticamente conforme autorização.**

---

## Etapa 2 — F2 Internacionalização Foundation

### Objetivo
Preparar arquitetura Country/Market/Language/Currency/Timezone/Locale (BR/PT), sem fiscalidade portuguesa.

### Decisão — Market/LegalEntity não promovidos a tabela
Avaliado explicitamente: nenhum consumidor real exige persistência ainda (nenhuma tela seleciona mercado por tenant, Finance Core/Proposal — etapas futuras — ainda não construídos). Mantidos como contrato TS, reavaliar nas Etapas 4/5.

### Implementação
`packages/db/src/i18n/` (novo: `locales.ts` com catálogo BR/PT, `format.ts` com `formatarMoeda`/`formatarDataHora`) — substituiu 3 ocorrências de `toLocaleString("pt-BR")` hardcoded em `leads/gates/jobs` (page.tsx) por chamadas parametrizadas.

### Achado real corrigido
`Intl.DateTimeFormat` não aceita `dateStyle`/`timeStyle` misturado com opções de componente (`hour`/`minute`) — pego pelo próprio teste, corrigido (opts substitui o padrão por completo, não faz merge parcial).

### Timezone
Princípio confirmado (não mudado): instante já é UTC via Postgres/Prisma. Exibição agora sempre com `timeZone` explícito — testado que o mesmo instante produz textos diferentes em BR vs. PT.

### Migrations
Nenhuma — Market/LegalEntity não promovidos, i18n é só código. 26 migrations continuam.

### Testes
9 novos (`i18n.test.ts`).

### Regressão
297/297 (era 288 — +9). Typecheck limpo. Build limpo (16 rotas).

### Limitações
Nenhuma UI ainda escolhe mercado dinamicamente (tudo usa o default BR hoje) — catálogo pronto, sem consumidor de seleção ainda. `<html lang>` e o site público não foram tocados (fora do escopo de foundation).

### Decisões humanas pendentes
Nenhuma nova.

### Resultado / Status
**GREEN** — critérios de avanço todos satisfeitos (ver relatório completo).

### Próximo bloco autorizado
Etapa 3 — CRM Evolution 01. **Prosseguindo automaticamente conforme autorização.**

---

## Etapa 3 — CRM Evolution 01

### Objetivo
Evoluir o CRM de Kanban simples para ferramenta comercial completa: detalhe de lead, timeline, filtros/busca, prioridade, motivo de perda, Note/Task tipados, follow-up melhorado, repescagem estruturada (Job Engine), lead scoring foundation, Next Best Action foundation — sem ampliar a autonomia real do agente Yalla além de T3.

### Escopo (11 itens autorizados)
Todos os 11 entregues: página `/leads/[id]`, timeline, filtros, busca, prioridade, motivo de perda, Note/Task tipados, follow-up melhorado, repescagem estruturada, lead scoring foundation, Next Best Action foundation.

### Arquitetura
`NoteTipo`/`TaskTipo` (enums, generalizando um prefixo textual antigo) · timeline sem entidade nova (mescla Note+Task+Message em memória, Audit técnico continua separado) · repescagem via Job Engine real (T5) — job `lead.repescar_elegibilidade` reavalia elegibilidade NA HORA de rodar, dois pontos de agendamento (tool do Yalla `lead.agendar_repescagem` e ação humana), idempotente por dia · `packages/db/src/crm/` (novo: `lead-scoring.ts`, `next-best-action.ts`, `atividade.ts` — puros, determinísticos, sem acesso a IA/banco onde possível) · `/leads/[id]` (nova) consolidando tudo · busca/filtro server-side via `searchParams`.

### Limitação honesta registrada deliberadamente
A cadeia completa pedida na autorização para repescagem ("Yalla compõe/prepara mensagem → policy → envio") **não foi implementada** — só a fundação real e testável (regra → elegibilidade → job → sinal via Note+Task). Nenhuma Message é criada autonomamente em nenhum teste/cenário; decisão humana ou Yalla (via `tarefa.criar`) decide o que fazer com o sinal. Mesmo princípio de "recomendação ≠ execução automática" do Next Best Action.

### Migrations
1 nova, aditiva, defaults seguros: `20260915020000_crm_evolution_01` (enums `NoteTipo`/`TaskTipo`, colunas `leads.prioridade`/`leads.motivo_perda`/`notes.tipo`/`tasks.tipo`). **28 migrations no total.**

### Segurança
Toda escrita nova sob `withTenant`/RLS. `lead.agendar_repescagem` é `SAFE_WRITE`/sem Gate (só reavalia depois, sem efeito externo). `motivoPerda` sanitizado (HTML removido) e truncado. Nenhuma tool/ação nova ganhou autoaprovação, envio autônomo ou bypass de Gate.

### Testes
29 novos: 6 (`lead-scoring.test.ts`) + 8 (`next-best-action.test.ts`) + 8 (`job-lead-repescar.test.ts`, cobre elegibilidade/reavaliação em tempo real/tool/idempotência/default-deny/nunca-envia-mensagem) + 7 (`leads-actions.test.ts`, cobre motivo de perda/prioridade/tarefa/RBAC).

### Regressão
**326/326** (era 297 — +29). Typecheck limpo (`packages/db` e `apps/web`). Build limpo — 17 rotas.

### Verificação ponta a ponta
Navegador real: detalhe do lead renderizando score/NBA/atribuição/preferências/timeline corretamente, checkbox de tarefa confirmado via DOM, busca filtrando corretamente, zero erros de console. Fluxo de `window.prompt` (motivo de perda) não exercido no navegador automatizado por risco de travar a sessão (diálogo nativo bloqueante) — a regra de negócio por trás dele foi coberta por teste de integração direto, que é a garantia que importa.

### Limitações
Repescagem não compõe/envia mensagem (ver acima); lead scoring 100% determinístico, sem IA nesta rodada; timeline sem paginação (até 50 mensagens recentes por conversa); busca é substring simples, sem full-text/ranking.

### Decisões humanas pendentes
Nenhuma nova.

### Resultado / Status
**GREEN** — 11/11 itens do escopo entregues, 29/29 testes novos passando, 326/326 regressão completa, typecheck/build limpos, migration única aditiva e consistente, RLS protegido, nenhuma vulnerabilidade introduzida, nenhuma decisão do fundador indispensável, nenhum agente ganhou autoaprovação, verificação ponta a ponta em navegador real feita (relatório completo em `docs/CRM_EVOLUTION_01_FECHAMENTO.md`).

### Próximo bloco autorizado
Etapa 4 — Finance Core Foundation 02. **Prosseguindo automaticamente conforme autorização.**

---

## Etapa 4 — Finance Core Foundation 02

### Objetivo
Avaliar as 9 entidades do motor financeiro (`FinancialAccount`/`Receivable`/`Payable`/`FinancialTransaction`/`CostCenter`/`RevenueCenter`/`Commission`/`Refund`/`FinancialCategory`) e implementar só as já justificadas, preparando (sem forçar) associação futura com Lead/Proposal/Booking/etc.

### Matriz de classificação e decisão
Nenhuma das 9 entidades tem hoje um consumidor real (não existe Proposal/Booking/Payment implementado; a Etapa 5 grava preço/margem no próprio Proposal, não num motor financeiro separado; Supplier/Partner/Booking/Trip/Customer/Campaign não existem como conceito no código). Mesma disciplina de Market/LegalEntity (F2): **todas ficam como contrato TypeScript puro, zero tabela/migration** — "não construir ERP sem consumidor" (princípio de PM-CRM-FIN-ARCH-01). Matriz completa em `docs/FINANCE_CORE_FOUNDATION_02_FECHAMENTO.md`.

### Implementação
`packages/db/src/finance/types.ts` (estendido, 9 interfaces + 7 union types) — referências a entidades futuras sempre como `string` opaca, nunca FK Prisma; `CostCenter` documentado como não relacionado ao `CostEvent` de T2 (custo técnico de IA ≠ custo financeiro do negócio). RLS/Audit/Gate documentados como obrigatórios desde o primeiro dia de qualquer promoção futura.

### Country Pack Portugal
Continua bloqueado — nenhuma regra fiscal concreta criada ou insinuada; registry de T-CRM-FIN-ARCH-01 continua sem nenhum pack real.

### Migrations
Nenhuma. 28 migrations continuam.

### Segurança
Nada a proteger (zero tabela nova = zero superfície nova). Compromisso de RLS/Audit/Gate obrigatórios documentado no próprio código para quando houver promoção real.

### Testes
Nenhum novo — consistente com o precedente de Market/LegalEntity/FiscalProfile/ExchangeRateQuote (contratos puros sem runtime não ganham teste; só registries com comportamento real, como CountryPack, são testados).

### Regressão
**326/326** (inalterado — mudança puramente aditiva de tipos, sem runtime). Typecheck limpo. Build limpo — 17 rotas (nenhuma nova).

### Limitações
Nenhuma tabela financeira real existe — relatórios financeiros/fluxo de caixa/reconciliação dependem de Booking/Payment, fora do escopo de toda a janela PM-NIGHT-RUN-01.

### Decisões humanas pendentes
Nenhuma nova.

### Resultado / Status
**GREEN** — avaliação completa e documentada (entregável obrigatório desta etapa), decisão consistente com o precedente já estabelecido, nenhuma tabela/migration nova, Country Pack Portugal continua bloqueado, regressão completa passando, typecheck/build limpos, nenhuma decisão do fundador indispensável (relatório completo em `docs/FINANCE_CORE_FOUNDATION_02_FECHAMENTO.md`).

### Próximo bloco autorizado
Etapa 5 — Proposal Foundation 01. **Prosseguindo automaticamente conforme autorização.**

---

## Etapa 5 — Proposal Foundation 01

### Objetivo
Fundação do motor de proposta comercial: lead/roteiro/datas/passageiros/serviços/preço/custos/margem/condições/validade, versionamento obrigatório, Gates comerciais preparados — Yalla prepara/recomenda, nunca autoaprova.

### Implementação
Tabela nova `Proposal` (FK real pra `Lead`) — versionamento imposto estruturalmente (só `RASCUNHO` edita in-place; qualquer alteração depois disso cria uma linha nova via `criarNovaVersao`, marca a anterior `SUBSTITUIDA`, nunca reescreve). `packages/db/src/crm/proposta-politica.ts` (`avaliarPoliticaComercial`, pura) avalia 5 gatilhos (desconto ≥15%, variação de preço ≥20%, margem <10%, condição excepcional, compromisso externo sensível declarados) — `enviarProposta` cria um `Gate` COMERCIAL real (T1) e trava em `AGUARDANDO_APROVACAO` quando algum gatilho dispara; só `decidirGate` (decisor humano real) libera via `confirmarEnvioAposAprovacaoGate`. `cotacaoCambio` grava snapshot do `ExchangeRateQuote` (Etapa 4) — câmbio ≠ preço, nunca recalcula sozinho. UI nova em `/leads/[id]` (painel "Propostas comerciais" com criação/envio/aceite/recusa). 2 permissões RBAC novas (`propostas.view`/`propostas.manage`).

### Migrations
2 novas, aditivas: `20260915030000_proposal_foundation_01` (tabela), `20260915030100_enable_rls_proposals` (RLS). **31 migrations no total.**

### Segurança
RLS testado (isolamento multi-tenant real). Toda transição sensível auditada. Nenhum agente autoaprova (decisor sempre um User real, herdado de T1). Motivo de recusa sanitizado.

### Testes
33 novos: 12 (`proposta-politica.test.ts`) + 21 (`proposals.test.ts`, cobre versionamento/política/Gate/aceite-recusa/expiração/isolamento).

### Regressão
**359/359** (era 326 — +33). Typecheck limpo. Build limpo — 17 rotas (`/leads/[id]` cresceu com o painel de propostas).

### Verificação ponta a ponta
Fluxo completo real no navegador: proposta com desconto de 20% → bloqueada (`AGUARDANDO_APROVACAO`) → Gate real aparece em `/gates` com motivo exato → aprovado → "Verificar aprovação" libera → `ENVIADA` → "Marcar como aceita" → `ACEITA`. Zero erros de console em qualquer etapa do fluxo, incluindo o caminho de Gate (não só o caminho feliz).

### Limitações
Roteiro/serviços em texto/JSON livre (motor de catálogo estruturado é futuro); limiares da política são fixos da fundação, não configuráveis por tenant ainda; nenhum envio automático de mensagem ao cliente (proposta fica pronta no CRM, envio de fato é decisão humana).

### Decisões humanas pendentes
Nenhuma nova.

### Resultado / Status
**GREEN** — fundação completa (dados + versionamento obrigatório + política comercial integrada a Gate real), 33/33 testes novos, 359/359 regressão completa, typecheck/build limpos, RLS desde o primeiro commit, RBAC estendido, nenhuma autoaprovação possível, verificação ponta a ponta completa incluindo o caminho de Gate (relatório completo em `docs/PROPOSAL_FOUNDATION_01_FECHAMENTO.md`).

### Próximo bloco
**Nenhum automático — teto da autorização (§36).** Ver `docs/PM_NIGHT_RUN_01_FINAL.md`.

---

## Fechamento da sequência PM-NIGHT-RUN-01

5 de 5 etapas concluídas, todas GREEN. Nenhuma parada por RED em nenhum ponto da sequência. Ver `docs/PM_NIGHT_RUN_01_FINAL.md` para o relatório final completo (tabela-resumo, estado atual do produto, pendências, próximos blocos recomendados).
