# PM-CONV-07 — Resultado: KeroMarketing

**Status: BLOQUEADO — HUMAN_DECISION_PENDING. Localizado e auditado (com colaboração de uma sessão paralela dona do repositório); integração real de código não é possível ainda porque a superfície de auth necessária não existe.**

## Localização (resolvido)

`KeroMarketing` não é um repositório próprio — é um conjunto de módulos reais dentro do backend "Ai DEV Orquestrador" (`C:\Projetos\Ai DEV Orquestrator\src\platform\`), confirmado por outra sessão Claude que já trabalha nesse repositório, e verificado de forma independente por mim (leitura direta de código, não confiança cega no que foi descrito). Módulos existentes: `google-ads/`, `meta-ads/`, `content-social/`, `website-intelligence/`, `search-console/`, `ga4/`, `marketing-attribution/`, `connections/`.

## Auditoria real (evidência, com uma correção sobre o que foi descrito inicialmente)

Minha auditoria independente, na branch `main` daquele repositório, inicialmente **contradisse** duas afirmações da sessão parceira — investigado e esclarecido: a branch `main` (que eu tinha acesso) é realmente só-leitura pra Google Ads/Meta Ads (confirmado por testes de enforcement estruturais, `googleAdsReadOnlyEnforcement.test.ts`/`metaAdsReadOnlyEnforcement.test.ts`, que proíbem qualquer capability de escrita), mas o trabalho de criação real de campanha (sempre `PAUSED`, atrás de aprovação humana) existe numa branch separada não mergeada (`claude/keromarketing-google-ads-campaigns`), confirmado pela própria sessão que trabalha nela. **Este é o tipo exato de verificação que este projeto pratica desde a primeira auditoria (CongaOne/fabricaease/KeroSolar)** — nunca aceitar uma descrição sem checar o código, e quando duas fontes divergem, investigar a causa real (aqui: branches diferentes) em vez de escolher uma versão por conveniência.

**Confirmado, de forma consistente entre as duas verificações:**
- `MarketingEventStore` (atribuição de marketing) está **genuinamente vazio em produção** — implementação em memória, zero chamadores reais de `recordTouchpoint`/`recordConversion` em todo o código-fonte, toda pergunta de atribuição responde `NO_DATA` honestamente (nunca inventa dado).
- **Nenhum mecanismo de autenticação serviço-a-serviço existe** — toda rota HTTP montada (`connectionService`, `/api/connections`, `/api/capabilities`) exige cookie de sessão de um usuário humano autenticado NAQUELE sistema. Não existe API key, não existe OAuth client-credentials, não existe nenhum caminho para um sistema externo (como o Partiu Marrocos) se autenticar.
- Na branch `main`: os 6 orquestradores de inteligência (google-ads/meta-ads/ga4/search-console/marketing-attribution/content-social) só são alcançáveis via `/api/conversations` (chat interno) — nenhuma rota `/api/marketing/*` existe.
- Credenciais Google/Meta (OAuth app-level + developer token) são providas manualmente pelo "Platform Owner" via CLI num Secret Vault próprio — nunca inventadas, retornam `undefined` quando ausentes (mesma disciplina de "nunca simular integração externa" já usada em todo o Partiu Marrocos).

## Por que a integração de código real não é possível nesta rodada

A pergunta certa não é "o que reaproveitar" (essa parte está clara: Google Ads/Meta Ads/GA4/Search Console/Website Intelligence real, Content&Social real com publicação hoje só em provider fake, Attribution com fundação real mas sem ingestão). A pergunta bloqueante é **como um sistema externo chama isso**. Hoje, a resposta é: não há como, sem impersonar um usuário humano daquele sistema (o que seria inseguro e fora de qualquer autorização). Implementar qualquer chamada do Partiu Marrocos pra essas capacidades hoje exigiria inventar uma forma de autenticação que não existe no lado do KeroMarketing — exatamente o tipo de "integração simulada"/"sucesso fictício" que a autorização proíbe explicitamente.

## Arquitetura de integração recomendada (definição, não execução)

Quando autorizado (e quando a superfície de auth existir do lado do KeroMarketing):
1. **Contrato de auth serviço-a-serviço** é pré-requisito, não opcional — recomendação: uma API key por integração externa (workspace-scoped, revogável, nunca um cookie de sessão compartilhado), gerada e armazenada do lado do KeroMarketing, consumida do lado do Partiu Marrocos via `SecretProvider` (mesmo mecanismo já usado pra WhatsApp/LLM — nunca texto plano).
2. **Direção do fluxo de dado, não espelhamento**: o Partiu Marrocos é fonte de verdade pra Lead/Contact/Conversion (já tem `AttributionTouch` real, T6) — a integração natural é o Partiu Marrocos ALIMENTAR o `MarketingEventStore` do KeroMarketing (que hoje está vazio esperando exatamente isso) com touchpoints/conversões reais, não o contrário. Consultar Ads/SEO/GA4 do KeroMarketing pra enriquecer o Dashboard do Partiu Marrocos é a segunda direção, sempre leitura.
3. **Nunca duplicar**: nenhum Ads Engine/Analytics Engine/Social Engine novo no Partiu Marrocos — tudo isso já existe e é real no KeroMarketing; o Partiu Marrocos só chama, nunca reimplementa.
4. **Gates continuam obrigatórios**: qualquer ação que gaste dinheiro (campanha) ou publique externamente, mesmo chamada via essa integração futura, passa pelo Gate já existente do lado que a executa (hoje isso já é assim dentro do próprio KeroMarketing — aprovação humana antes de qualquer campanha sair de `PAUSED`).

## Classificação e próximo passo

**HUMAN_DECISION_PENDING** — decisões que só o usuário pode tomar:
- Autorizar (ou não) que o time/sessão responsável pelo KeroMarketing construa a superfície de auth serviço-a-serviço necessária.
- Decidir se a branch `claude/keromarketing-google-ads-campaigns` (criação real de campanha) deve ser revisada/mergeada antes de qualquer integração, ou se a integração começa só pelas capacidades read-only já em `main`.
- Priorizar entre as capacidades disponíveis (SEO/Website Intelligence primeiro, que não têm custo de mídia, vs. Ads, que tem).

**Continua, sem essa decisão**: nenhuma linha de código de integração foi escrita nesta rodada (conforme a própria autorização pede — só localizar, auditar, definir arquitetura). Nada no KeroMarketing foi modificado por mim.

## Verificação

Toda a auditoria acima foi feita por dois agentes de leitura independentes (um lendo o código-fonte real do Ai DEV Orquestrador em `main`, citando arquivo:linha pra cada afirmação) mais confirmação direta da sessão que trabalha naquele repositório — nenhuma conclusão aqui vem de suposição sobre nome de pasta/estrutura.
