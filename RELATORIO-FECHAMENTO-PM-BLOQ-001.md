# PM-BLOQ-001 — Secret Provider — Relatório de Fechamento

Escopo autorizado: **PM-BLOQ-001** (eliminar `Tenant.aiApiKey` em texto plano via uma abstração `SecretProvider`, avaliando — não assumindo — a migração das credenciais do WhatsApp). Nenhum outro bloco (T2-T5, F2-F6, novas features comerciais, chamada paga de IA, mudança de campanha, `git init`/`push`) foi tocado.

---

## 1. Resumo executivo

`Tenant.aiApiKey`, `WhatsappAccount.accessToken` e `WhatsappAccount.appSecret` não existem mais em texto plano em nenhuma tabela — foram substituídos por `secretRef` opacos apontando para uma tabela `secrets` tenant-scoped sob RLS, com envelope AES-256-GCM (`node:crypto`, sem dependência de Windows/DPAPI nem de nenhum vendor de nuvem). O contrato `SecretProvider` é provider-agnóstico: a implementação local de hoje pode ser trocada por um provider de produção real (AWS/GCP/Azure/Vault) sem mudar nenhum código de domínio. `WhatsappAccount.verifyToken` foi mantido em texto plano **de propósito**, com justificativa estrutural (handshake do webhook da Meta acontece antes de haver tenant conhecido). Rotação funciona sem trocar o `secretRef` (testado sem chamada externa real). Auditoria (reaproveitando o Audit Log de T1) registra só metadados — nunca valores — inclusive nos caminhos de falha. RBAC reaproveita `whatsapp.manage` (já Administrador-only). 25 testes de segurança novos, todos passando; regressão completa (171 testes) sem quebra; typecheck e build limpos.

## 2. Inventário de segredos encontrado

| Campo | Classificação | Decisão |
|---|---|---|
| `Tenant.aiApiKey` | SECRET | Migrado |
| `Tenant.aiProvider` | Configuração não secreta | Sem mudança |
| `WhatsappAccount.accessToken` | SECRET | Migrado |
| `WhatsappAccount.appSecret` | SECRET | Migrado |
| `WhatsappAccount.verifyToken` | Token de verificação (categoria distinta de SECRET) | Mantido em texto plano — ver seção 9 |
| `Device.apiKeyHash` | Credencial de dispositivo | Já protegida (hash bcrypt) — fora de escopo |
| `User.passwordHash` | Credencial de usuário | Já protegida (hash bcrypt) — fora de escopo |
| `JWT_SECRET`/`SESSION_COOKIE_NAME`/`DATABASE_URL` | Segredo/config de infraestrutura (env var) | Padrão 12-factor já correto — fora do escopo do SecretProvider |
| `Session` (tabela) | — | Guarda só metadados de sessão (`userId`/`tenantId`/`criadoEm`/`expiraEm`/`revogadoEm`/`ip`/`userAgent`) — nenhum JWT/token bruto persistido; nada a migrar |

Nenhum valor foi impresso, logado ou inspecionado em nenhum momento desta rodada — todo o inventário foi feito por nome de campo e localização de código.

## 3. Arquitetura implementada

- **Contrato** `SecretProvider` (`packages/db/src/secret-provider.ts`): `salvar`/`obter`/`remover`/`rotacionar`, todos escopados por `tenantId`.
- **`LocalSecretProvider`** — única implementação desta rodada: AES-256-GCM via `node:crypto`, envelope versionado (`ciphertext`/`iv`/`authTag` base64 + `algoritmo` + `versao` + `keyId`), master key de `SECRET_PROVIDER_MASTER_KEY` (env, 32 bytes base64, nunca junto do ciphertext). Isolamento cross-tenant garantido por `withTenant`/RLS, mesmo padrão de `gates.ts`/`device-auth.ts`.
- **`getSecretProvider()`** lê `SECRET_PROVIDER` (default `"local"`); qualquer outro valor lança `SecretProviderIndisponivelError` — nunca escolhe um vendor por conta própria.
- **Camada de auditoria** (`configurarSecret`/`obterSecret`/`rotacionarSecret`/`removerSecret`) — chama o provider e grava `SECRET_CONFIGURED`/`SECRET_ROTATED`/`SECRET_REMOVED`/`SECRET_ACCESS_FAILED` via `registrarEvento` (T1), sempre metadados, nunca o valor.
- **Rotação** mantém o mesmo `secretRef` — domínio nunca precisa saber que uma rotação aconteceu.
- **Fail-closed**: qualquer falha do provider (master key ausente, ciphertext corrompido, vendor desconhecido) grava `SECRET_ACCESS_FAILED` e devolve `null` em leitura (`obterSecret`) — nunca lança para o chamador, nunca cai para texto plano. Em escrita (`configurarSecret`/`rotacionarSecret`), a falha é propagada como exceção (é uma ação síncrona do usuário — precisa de um erro visível, não um `null` silencioso).

## 4. Arquivos alterados/criados

**Criados:**
- `packages/db/src/secret-provider.ts`
- `packages/db/src/scripts/migrate-secrets-off-plaintext.ts`
- `packages/db/tests/integration/secret-provider.test.ts`
- `apps/web/tests/integration/secret-provider-wiring.test.ts`
- `apps/web/tests/mocks/server-only-empty.ts`
- `packages/db/prisma/migrations/{20260910202656_secret_provider_add_columns, 20260910203123_enable_rls_secrets, 20260910204000_secret_provider_drop_plaintext}/migration.sql`

**Alterados:**
- `packages/db/prisma/schema.prisma` (enum `SecretFinalidade`, model `Secret`, `Tenant.aiApiKey`→`aiApiKeySecretRef`, `WhatsappAccount.{accessToken,appSecret}`→`{accessTokenSecretRef,appSecretSecretRef}`)
- `packages/db/prisma/rls.sql` (RLS de `secrets`)
- `packages/db/src/index.ts` (export de `secret-provider.ts`)
- `packages/db/tests/integration/whatsapp-isolation.test.ts` (campo renomeado)
- `apps/web/src/app/actions/ai.ts` (`salvarConfigIA` configura/rotaciona via provider; nova action `removerChaveIA`)
- `apps/web/src/app/actions/whatsapp.ts` (`salvarContaWhatsapp` configura/rotaciona via provider; `responderWhatsapp` resolve o access token via `obterSecret` antes de enviar)
- `apps/web/src/lib/ai/yalla.ts` (resolve a chave via `obterSecret` no momento do uso)
- `apps/web/src/app/api/webhooks/whatsapp/route.ts` (HMAC e envio do Yalla resolvem `appSecret`/`accessToken` via `obterSecret`)
- `apps/web/src/app/(app)/canais/page.tsx` e `.../ia-form.tsx` (botão "Remover chave" novo)
- `apps/web/vitest.config.ts` (alias de teste para `server-only`)
- `.env` / `.env.example` (`SECRET_PROVIDER`, `SECRET_PROVIDER_MASTER_KEY` — valor real gerado só no `.env`, nunca impresso nesta conversa)
- `README.md` (seção PM-BLOQ-001)

## 5. Migrations

3 migrations novas, aplicadas em sequência (mais o script de dados entre a 1ª e a 3ª — ver seção 8):
1. `20260910202656_secret_provider_add_columns` — cria `secrets` + colunas `*_secret_ref` novas; mantém as colunas antigas (aditiva, de propósito).
2. `20260910203123_enable_rls_secrets` — RLS de `secrets` (mesmo padrão de `gates`/T1).
3. `20260910204000_secret_provider_drop_plaintext` — remove `ai_api_key`/`access_token`/`app_secret` definitivamente; `access_token_secret_ref` volta a NOT NULL.

## 6. Provider local

`LocalSecretProvider` (`packages/db/src/secret-provider.ts`) — AES-256-GCM via `node:crypto`, sem dependência de Windows/DPAPI, sem infraestrutura de nuvem obrigatória. Master key só em `SECRET_PROVIDER_MASTER_KEY` (env), nunca no banco. Rótulo claro de "local/dev" no próprio comentário do módulo e do model `Secret` no schema.

## 7. Contrato de provider de produção

Interface `SecretProvider` já é o contrato de produção — um provider real (AWS Secrets Manager/KMS, Google Secret Manager, Azure Key Vault, HashiCorp Vault) implementaria `salvar`/`obter`/`remover`/`rotacionar` sem tocar na tabela `secrets` (devolveria uma referência externa, ex. ARN, como `secretRef`). Nenhum vendor foi escolhido nesta rodada — `getSecretProvider()` lança erro claro para qualquer `SECRET_PROVIDER` que não seja `"local"`, registrado como **PRÓXIMO BLOQUEADOR DE SECRET MANAGEMENT** (escolha de vendor de produção).

## 8. Migração de `aiApiKey` (e das credenciais do WhatsApp)

Como uma migration SQL pura não alcança o provider (cifrar exige a master key + `node:crypto`), a migração foi um script real e idempotente (`packages/db/src/scripts/migrate-secrets-off-plaintext.ts`), rodado nesta sessão entre as migrations 1 e 3: detecta valor em texto plano → cifra → grava `secrets` → grava o `secretRef` → zera a coluna antiga → confirma que não sobrou texto plano (lança se sobrar).

**Evidência real**: a base de dev não tinha nenhum dado em texto plano no momento desta rodada (confirmado por contagem antes de começar — 0 de 3 tenants, 0 contas WhatsApp). Para não fechar este item só com "não havia nada para testar", o procedimento foi verificado nesta sessão com dado sintético inserido manualmente nas colunas antigas (ainda existentes na fase intermediária, entre as migrations 1 e 3): migrou corretamente, zerou as colunas antigas, o round-trip via `obterSecret` bateu com o valor original, e nenhum evento de auditoria continha o valor — depois disso, o dado de teste foi removido e a migration 3 (drop das colunas) foi aplicada. Ver limitação na seção 17.

## 9. Decisão sobre os secrets do WhatsApp

**Migrados** (`accessToken`/`appSecret`) — mesma abstração, risco incremental baixo (mesmo padrão de escrita/leitura já usado para `aiApiKey`, cobertos pelos mesmos testes de isolamento/rotação/fail-closed).

`verifyToken` foi **mantido em texto plano**, com justificativa estrutural, não por omissão: `packages/db/src/cross-tenant.ts::findWhatsappAccountByVerifyToken` faz uma busca por igualdade nele durante o handshake `GET` do webhook da Meta — que acontece **antes** de qualquer tenant ser conhecido (mesma situação estrutural do login). Não é possível mover isso para o envelope cifrado sem quebrar esse handshake (cifrar quebra a busca por igualdade). Classificado explicitamente como **token de verificação**, categoria distinta de SECRET.

## 10. RBAC

Reaproveitada `whatsapp.manage` (já existia, já era Administrador-only por padrão, já era usada por `salvarConfigIA` antes deste bloco) para toda operação de escrita de segredo (`salvarConfigIA`, `removerChaveIA`, `salvarContaWhatsapp`). Nenhuma permissão nova foi criada — decisão deliberada de rodapé mínimo, testada (`secret-provider-wiring.test.ts`: usuário sem `whatsapp.manage` é rejeitado com `ForbiddenError`, nada é escrito).

## 11. Audit

`SECRET_CONFIGURED`/`SECRET_ROTATED`/`SECRET_REMOVED`/`SECRET_ACCESS_FAILED`, via o mesmo `registrarEvento` de T1 — sempre `{finalidade}` (e, em falha, um `motivo` genérico como `"provider_indisponivel"`/`"falha_ao_decifrar"`), nunca o valor. Testado explicitamente que nenhum evento, em nenhum dos 4 tipos, contém o segredo — inclusive nos caminhos de falha.

## 12. Rotação

`rotacionarSecret` mantém o **mesmo** `secretRef` — só troca o conteúdo cifrado. Testado ponta a ponta sem nenhuma chamada externa real: secret A configurado → usado → rotacionado para B → B em uso → A não é mais recuperável (mesma linha, sobrescrita). Também testado na fiação real (`salvarContaWhatsapp` chamado duas vezes com valores diferentes mantém o mesmo `accessTokenSecretRef`, grava `SECRET_CONFIGURED` na primeira vez e `SECRET_ROTATED` na segunda).

## 13. Testes novos

- `packages/db/tests/integration/secret-provider.test.ts` — **16 testes**: round-trip, nunca em texto plano na tabela `secrets`, isolamento cross-tenant (obter/rotacionar/remover), rotação, remoção idempotente, fail-closed sem master key, provider desconhecido nunca escolhido silenciosamente, auditoria nunca contém o valor (caminho feliz e de falha), a exceção de append-only de T1 não foi ampliada.
- `apps/web/tests/integration/secret-provider-wiring.test.ts` — **9 testes**: RBAC bloqueia configuração sem `whatsapp.manage`, a action nunca devolve a chave pro cliente, Yalla decifra e chama o provedor de IA com a chave certa (via `fetch` mockado — nenhuma chamada real/paga em nenhum teste), fail-closed sem master key não dispara nenhuma chamada de rede, `removerChaveIA` desliga o Yalla de verdade, `responderWhatsapp` usa o access token decifrado, rotação mantém o mesmo `secretRef`.

Total: **25 testes de segurança novos**, todos passando.

## 14. Resultado completo dos testes

| Pacote | Suíte | Resultado |
|---|---|---|
| `db` | unit | 15/15 PASS |
| `db` | integration | 72/72 PASS (56 pré-existentes + 16 novos) |
| `web` | unit+integration | 84/84 PASS (75 pré-existentes + 9 novos) |
| **Total** | | **171/171 PASS, 0 FAIL** |

## 15. Resultado da regressão

T1 (Gates/Audit), Tenant Core, Auth, RBAC, CRM, Kanban, Lead Capture, WhatsApp (isolamento), Inbox, Yalla, KeroCar — todos os testes pré-existentes continuam passando, incluindo o teste renomeado em `whatsapp-isolation.test.ts` (campo `accessToken`→`accessTokenSecretRef`, mesma cobertura). Nenhuma quebra.

## 16. Typecheck/build

Typecheck limpo em `packages/db` e `apps/web` (`tsc --noEmit`, 0 erros). Build de produção limpo (`next build`, 19 rotas, exit code 0, incluindo `/canais` com o card do Yalla e o botão "Remover chave").

Verificação visual real no navegador (não só testes automatizados): logado como admin de um tenant de verificação temporário, preenchi e salvei a chave de IA em `/canais` — o card mudou para "Ligado — respondendo automaticamente via anthropic", os botões "Atualizar chave"/"Desligar"/"Remover chave" apareceram. Conferido no banco (script de verificação, depois removido): `aiApiKeySecretRef` preenchido, a tabela `secrets` não contém o valor em texto plano em lugar nenhum da linha, `obterSecret` devolve o valor original certo, e o único evento de auditoria gravado (`SECRET_CONFIGURED`) tem só `{finalidade}` como detalhe. O clique físico em "Remover chave" esbarrou na mesma limitação de automação de navegador já registrada no relatório de T1 (a ferramenta de browser não consegue confirmar um `window.confirm()` nativo) — não é um bug do código: o caminho de remoção está coberto por teste automatizado real (`removerChaveIA` em `secret-provider-wiring.test.ts`), incluindo a prova de que o Yalla volta a ficar silencioso (sem nenhuma chamada de rede) depois da remoção. Tenant/usuário de verificação foram removidos ao final.

## 17. Limitações

- **Master-key rotation** (trocar a própria `SECRET_PROVIDER_MASTER_KEY` sem invalidar segredos já cifrados) não foi implementada — fora do que a autorização pediu (que é sobre rotacionar o *segredo*, não a chave mestra). O campo `keyId` já existe no schema para viabilizar isso no futuro sem redesenho.
- **Verificação da migração de dado legado** (seção 8) foi feita manualmente nesta sessão com dado sintético, não como teste automatizado permanente — depois que a migration 3 remove as colunas antigas, elas não existem mais fisicamente, então não há como manter esse cenário específico como teste de regressão sem recriar as colunas só para testar. O script `migrate-secrets-off-plaintext.ts` continua no repositório como o procedimento operacional documentado.
- **Provider de produção real** (AWS/GCP/Azure/Vault) não foi escolhido nem implementado — registrado como próximo bloqueador de secret management, não como pendência silenciosa.
- Mesmo achado de T1 permanece registrado: expiração de Gate continua um sweep preguiçoso (sem Job Engine/T5) — não é escopo deste bloco, só reconfirmado que nada aqui mudou isso.

## 18. Status Git

Este repositório **continua sem inicialização git** (`fatal: not a git repository`, reconfirmado nesta rodada). Não há branch, HEAD nem commits a reportar. Todo o trabalho está no working tree local, sem commit. `git init` não foi executado (não autorizado nesta rodada).

## 19. Veredito

**PM-BLOQ-001 CONCLUÍDO.**

Checklist do Gate Final (todos verdadeiros): `aiApiKey` não é mais armazenado em texto plano; a aplicação usa o `SecretProvider` (ai.ts/whatsapp.ts/yalla.ts/webhook adaptados); existe um provider local seguro; a arquitetura não depende de Windows/DPAPI; a UI não recupera o segredo já salvo; RBAC protege a configuração; Audit registra eventos sem valores; rotação funciona (testada sem chamada externa real); remoção funciona; isolamento cross-tenant é garantido (RLS, testado); falha é fail-closed (testada); testes de segurança passam (25 novos); regressão completa passa (171/171); typecheck passa; build passa.

## 20. Recomendação do próximo bloco

Duas opções ficaram registradas como bloqueadores/decisões pendentes deste próprio bloco, não como novo trabalho comercial:
- **Escolha de um provider de produção real** para o `SecretProvider` (AWS Secrets Manager/KMS, Google Secret Manager, Azure Key Vault ou HashiCorp Vault) antes de qualquer deploy real com múltiplos tenants pagantes — a arquitetura já está pronta para receber a implementação, só falta a decisão de vendor (que a autorização deste bloco explicitamente pediu para NÃO tomar sozinho).
- Segundo o plano mestre, o próximo bloco natural da trilha transversal é **T2 — Cost Control**, que depende estruturalmente de T1 (já concluído) e não depende deste bloco. Aguardando autorização explícita — **T2 não foi iniciado automaticamente**.

---

PARAR. NÃO iniciar T2 automaticamente.
