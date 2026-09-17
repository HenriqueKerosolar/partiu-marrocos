# Proposal Foundation 01 — Relatório de Fechamento

**Etapa 5 de 5 (última etapa autorizada) — PM-NIGHT-RUN-01 (COMANDO DE EXECUÇÃO CONTINUADA CONTROLADA)**
Executada sob autorização já concedida ("SE FINANCE FOUNDATION = GREEN"), sem pausa para nova aprovação. Após esta etapa, a autorização exige PARADA TOTAL mesmo com tudo GREEN (teto explícito, §36) — ver `docs/PM_NIGHT_RUN_01_FINAL.md`.

## Objetivo

Construir a fundação de um motor de proposta comercial: dados de lead/roteiro/datas/passageiros/serviços/preço/custos/margem/condições/validade, com versionamento obrigatório (nunca sobrescrever silenciosamente uma proposta já enviada) e Gates comerciais preparados (desconto relevante, mudança de preço excepcional, margem abaixo do limite, condição comercial excepcional, compromisso externo sensível) — Yalla pode preparar/recomendar, nunca autoaprovar.

## O que foi construído

### Modelo de dados (`Proposal`, tabela nova)
Campos: `leadId` (FK real — Lead já existe), `versao`, `status`, `roteiro`, `datasViagem`, `quantidadePassageiros`, `servicosIncluidos`/`servicosExcluidos`, `moeda`, `preco`, `precoReferencia`, `custos`, `condicoes`, `validade`, `cotacaoCambio` (snapshot `ExchangeRateQuote` do Finance Core, Etapa 4 — câmbio ≠ preço, nunca recalcula o preço sozinho), `condicaoExcepcional`/`compromissoExternoSensivel` (flags declaradas, nunca inferidas), `gateId`, `criadoPorId`, timestamps de envio/aceite/recusa.

### Versionamento obrigatório (§33) — imposto estruturalmente, não só documentado
- `RASCUNHO`: editável in-place (`atualizarPropostaRascunho`).
- A partir de `ENVIADA`/`AGUARDANDO_APROVACAO`/`ACEITA`/`RECUSADA`/`EXPIRADA`: **não existe função de update** — só `criarNovaVersao`, que cria uma linha nova (`versao+1`, `substituiPropostaId` apontando pra anterior) e marca a anterior `SUBSTITUIDA`. Testado ativamente: tentar editar uma proposta `ENVIADA` in-place falha (`NAO_E_RASCUNHO`); o preço da v1 nunca muda depois que a v2 é criada.
- Preço/moeda/validade/cotação de uma proposta `ENVIADA` ficam congelados pra sempre (a linha inteira nunca é reescrita) — é exatamente isso que garante "preço enviado ao cliente preserva valor/moeda/validade/cotação".

### Política comercial → Gate `COMERCIAL` (§34) — Yalla nunca autoaprova
`packages/db/src/crm/proposta-politica.ts` (`avaliarPoliticaComercial`, pura, determinística, cada motivo explicável) avalia 5 gatilhos: desconto ≥15% sobre `precoReferencia`, variação de preço ≥20% entre versões, margem <10%, `condicaoExcepcional`/`compromissoExternoSensivel` declarados. `enviarProposta` (`packages/db/src/proposals.ts`) consulta essa política **antes** de marcar como `ENVIADA`: se exigir aprovação, cria um `Gate` categoria `COMERCIAL` de verdade (T1, mesma infraestrutura de sempre) e trava em `AGUARDANDO_APROVACAO` — só uma decisão humana real via `decidirGate` (com `decisorId` sempre um `User` membro do tenant, nunca "yalla"/"system") libera o envio, via `confirmarEnvioAposAprovacaoGate`. Gate rejeitado/expirado: proposta volta pra `RASCUNHO`, editável de novo — nunca fica "meio enviada".

### Aceite/recusa/expiração
`aceitarProposta`/`recusarProposta` só a partir de `ENVIADA` (motivo de recusa sanitizado). `expirarPropostasVencidas` — sweep preguiçoso (mesmo padrão de `expirarSeVencido` em Gates T1) — `ENVIADA`/`AGUARDANDO_APROVACAO` cuja `validade` passou vira `EXPIRADA`; `RASCUNHO` nunca expira sozinho (ainda não foi comprometido com o cliente).

### UI (`/leads/[id]`)
Painel "Propostas comerciais": lista todas as versões (badge de status, preço formatado, roteiro, validade), formulário de criação de rascunho, e ações contextuais por status (Enviar / Verificar aprovação / Marcar como aceita / Marcar como recusada). Gated por duas permissões novas (`propostas.view`/`propostas.manage`) — catálogo de RBAC estendido, papel "Vendas" ganha ambas, "Atendimento" ganha só visualização.

## O que NÃO foi construído (explicitamente fora de escopo, conforme o comando)

Booking completo, Payment completo, documentação de viagem completa, motor de fornecedor completo, área do viajante, Country Pack fiscal (nenhuma regra de IVA/AT/SAF-T tocada). O motor financeiro real (`FinancialTransaction`/`Receivable`/etc., Etapa 4) continua só como contrato — esta etapa não promoveu nenhum deles a tabela, e `Proposal` não referencia nenhum FK real pra eles (só os campos `preco`/`custos`/`precoReferencia` dentro da própria proposta, como já estava desenhado desde a avaliação da Etapa 4).

## RBAC — 2 permissões novas
`propostas.view` (ver propostas de um lead) e `propostas.manage` (criar/editar/enviar/aceitar/recusar). Administrador ganha ambas automaticamente (catálogo completo); Vendas ganha ambas; Atendimento ganha só `propostas.view`.

## Migrations

2 novas, ambas puramente aditivas (tabela nova, nenhuma alteração em tabela existente):
```
20260915030000_proposal_foundation_01   -- enum PropostaStatus + tabela proposals
20260915030100_enable_rls_proposals     -- RLS (mesmo padrão tenant_isolation de sempre)
```
**31 migrations no total** (era 29 ao final da Etapa 4).

## Segurança

- RLS (`FORCE ROW LEVEL SECURITY` + policy `tenant_isolation`) desde a migration que cria a tabela — testado ativamente (Tenant B não lista nem consegue criar proposta apontando pra lead do Tenant A; FK composta `(tenantId, leadId)` rejeita).
- Toda transição sensível (`PROPOSTA_CRIADA`, `PROPOSTA_ENVIADA`, `PROPOSTA_NOVA_VERSAO`, `PROPOSTA_ENVIO_BLOQUEADO_POR_GATE`, `PROPOSTA_ACEITA`, `PROPOSTA_RECUSADA`, `PROPOSTA_EXPIRADA`) passa por Audit Log (T1).
- Nenhum agente aprova a si mesmo: `decidirGate` já exige `decisorId` de um `User` membro real do tenant (estrutural, herdado de T1, reconfirmado aqui via teste de integração ponta a ponta com o fluxo de Proposal).
- Motivo de recusa sanitizado (remove HTML) antes de gravar.

## Testes novos (33)

- `packages/db/tests/unit/proposta-politica.test.ts` — 12 (cada gatilho isolado, combinação de múltiplos gatilhos, ausência de dados nunca inventa gatilho).
- `packages/db/tests/integration/proposals.test.ts` — 21 (criação/edição em rascunho; versionamento nunca reescreve; envio sem gatilho; política bloqueia e cria Gate; Gate aprovado libera envio; Gate rejeitado volta pra rascunho; Gate pendente não muda nada; aceite/recusa; expiração; isolamento multi-tenant).

## Regressão

**359/359 testes passando** (326 ao final da Etapa 4 + 33 novos). Typecheck limpo (`packages/db` e `apps/web`). Build limpo — 17 rotas (`/leads/[id]` cresceu de 1.65kB pra 3.49kB — painel de propostas).

## Verificação ponta a ponta (navegador real)

Fluxo completo exercido de verdade, não só testes automatizados:
1. Lead existente → "Nova proposta" → preço R$ 8.000 com preço de referência R$ 10.000 (desconto de 20%, acima do limite de 15%) → "Salvar rascunho".
2. "Enviar" → proposta vira `AGUARDANDO_APROVACAO`, mensagem explica o motivo.
3. Página `/gates` (Aprovações) mostra o Gate real, categoria "Comercial", com o motivo exato ("desconto de 20.0% sobre o preço de referência (limite: 15.0%)") — não um texto genérico.
4. "Aprovar" no Gate → decisão registrada.
5. Volta ao lead, "Verificar aprovação" → proposta vira `ENVIADA` de verdade.
6. "Marcar como aceita" → proposta vira `ACEITA`.

Zero erros de console em qualquer etapa. Dados de verificação (proposta de teste, Gate de teste, senha temporária do admin) removidos/restaurados ao final — nenhum dado de demonstração permanente deixado no banco (à exceção de um Gate de demonstração pré-existente, já expirado, removido durante a limpeza — não fazia parte de nenhum seed formal, era artefato de sessão anterior).

## Limitações

Roteiro/serviços são texto/JSON livre — motor de catálogo de serviços estruturado é trabalho futuro. `precoReferencia` é opcional e nunca inferido — se a proposta não informar, desconto nunca é avaliado (não inventa uma referência). Política comercial usa limiares fixos da fundação (15%/20%/10%) — configuração por tenant é trabalho futuro. Nenhuma composição/envio automático de mensagem ao cliente — a proposta fica pronta no CRM, o envio de fato ao cliente (WhatsApp/e-mail) é decisão humana, fora do escopo desta fundação.

## Decisões do fundador pendentes

Nenhuma nova.

## Resultado / Status

**GREEN** — fundação completa do motor de proposta (dados + versionamento obrigatório + política comercial real integrada ao Gate T1), 33/33 testes novos passando, 359/359 regressão completa, typecheck/build limpos, 2 migrations aditivas com RLS desde o primeiro commit, RBAC estendido corretamente, nenhum agente com poder de autoaprovação, verificação ponta a ponta completa em navegador real (incluindo o caminho de Gate — não só o caminho feliz).

## Próximo bloco

**Nenhum automático.** Esta é a última etapa autorizada por PM-NIGHT-RUN-01 (§36, teto explícito: "APÓS PROPOSAL FOUNDATION: PARAR. Mesmo se tudo estiver GREEN."). Ver `docs/PM_NIGHT_RUN_01_FINAL.md` para o fechamento completo da sequência e a lista do que precisa de nova autorização antes de continuar.
