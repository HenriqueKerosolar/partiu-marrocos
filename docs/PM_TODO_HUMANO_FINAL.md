# Partiu Marrocos — TODO Humano Final

Só itens que dependem de decisão/credencial/aprovação externa — nada aqui é corrigível por código. Consolida achados de PM-CONV-07 a PM-CONV-12 e PM-PRE-GOLIVE-MASTER-01.

**Atualizado no PM-PRE-GOLIVE-MASTER-01 (2026-09-17):** os itens "rate limiter distribuído" e "git init" da versão anterior deste documento foram **resolvidos por código nesta rodada** (rate limiter atômico em Postgres implementado e testado sob concorrência real; `git init` local feito, primeiro commit registrado) — removidos da lista abaixo.

---

## 1. Gateway de pagamento real

**AÇÃO:** decidir se e qual gateway conectar (Stripe/Mercado Pago/PIX direto/outro), obter as credenciais, autorizar a integração.
**MOTIVO:** `Payment` já é um domínio provider-neutral completo (idempotência, estados, estorno via Gate) — falta só o adapter de um provider real. Nenhuma credencial existe ou foi inventada neste ambiente.
**ONDE:** `packages/db/src/payment.ts` (`provider`/`providerReference` já reservados), novo webhook em `apps/web/src/app/api/webhooks/`.
**JÁ PRONTO:** todo o domínio — criação, sincronização com Booking, estorno gated, idempotência de submissão.
**DESBLOQUEIA:** cobrança automática real, conciliação automática (hoje sem gateway não há o que conciliar).
**PRIORIDADE:** alta se o negócio for processar pagamento online; nula se continuar 100% manual/offline por escolha.

---

## 2. KeroMarketing — auth serviço-a-serviço

**AÇÃO:** autorizar o time responsável pelo Ai DEV Orquestrador (onde o KeroMarketing vive) a construir uma superfície de autenticação externa (API key ou equivalente) para os módulos `google-ads/meta-ads/ga4/search-console/website-intelligence/content-social/marketing-attribution`.
**MOTIVO:** confirmado por auditoria real (dois agentes independentes + confirmação da sessão dona do repositório): hoje só existe auth por cookie de sessão de usuário humano DAQUELE sistema — nenhum caminho pra um sistema externo (Partiu Marrocos) chamar essas capacidades.
**ONDE:** `C:\Projetos\Ai DEV Orquestrator\src\platform\http\` (repositório externo, fora do escopo desta autorização).
**JÁ PRONTO:** capacidades reais do lado do KeroMarketing (Ads read-only, GA4/Search Console/Website Intelligence reais, Content&Social com mutação real mas publicação só via provider de teste); `AttributionTouch` real do lado do Partiu Marrocos, pronto pra alimentar o `MarketingEventStore` (hoje vazio) assim que a integração existir.
**DESBLOQUEIA:** todo o PM-CONV-07 (integração de Marketing).
**PRIORIDADE:** decisão do usuário — nenhuma urgência técnica identificada.

---

## 3. Provider de Postgres de produção

**AÇÃO:** decidir o provider (Neon/Supabase/RDS/outro), compatível com Vercel + connection pooling (`directUrl` já preparado no schema desde o PM-CONV-05).
**MOTIVO:** decisão de infraestrutura, não técnica — hospedagem já decidida como Vercel, banco ainda em aberto.
**JÁ PRONTO:** `directUrl` no schema, runbook de backup/restore (`PM_BACKUP_RESTORE_DR.md`) pronto pra qualquer provider Postgres padrão.
**DESBLOQUEIA:** deploy de produção real.
**PRIORIDADE:** alta — bloqueia qualquer deploy real.

---

## 4. Fase 3 — Tradução/Voz (F3)

**AÇÃO:** decidir se/quando iniciar, escolher provider (ex.: DeepL/Google Translate para texto; ElevenLabs ou equivalente para voz), obter credenciais.
**MOTIVO:** `TranslationProvider`/`VoiceProvider` já são contratos reais (`packages/db/src/i18n/{translate,voice}.ts`), sempre retornando `PROVIDER_NAO_CONFIGURADO` hoje — nunca simulado.
**JÁ PRONTO:** a abstração inteira, testada.
**PRIORIDADE:** decisão do usuário — explicitamente fora de escopo até nova autorização.

---

## 5. Country Pack fiscal/legal (Portugal, Brasil)

**AÇÃO:** validação jurídica/fiscal real (advogado/contador) antes de qualquer regra de IVA/imposto/documento obrigatório ser codificada.
**MOTIVO:** `CountryPack.calcularImposto`/`documentosObrigatorios`/`validarLegalEntity` são os 3 únicos métodos do contrato, e os 3 são, por natureza, terreno fiscal/legal — não existe uma implementação "só técnica" segura sem essa validação.
**ONDE:** `packages/db/src/finance/{types.ts,country-pack-registry.ts}` (registry real, testado, zero packs registrados — de propósito).
**JÁ PRONTO:** o registry default-deny, o catálogo de locale (BR/PT) já funcional para formatação (não fiscal).
**PRIORIDADE:** só relevante quando/se o negócio operar formalmente em Portugal com obrigação fiscal local.

---

## 6. Backup/DR — teste real de restore

**AÇÃO:** rodar o runbook (`docs/PM_BACKUP_RESTORE_DR.md`) num ambiente com `pg_dump`/`pg_restore` instalados (esta máquina de dev não tem — usa `embedded-postgres`, que não empacota essas ferramentas), confirmando o checklist de verificação pós-restore.
**MOTIVO:** o runbook usa comandos padrão PostgreSQL corretos, mas nunca foi executado ponta a ponta nesta sessão — declarado honestamente, não escondido. Reconfirmado no PM-PRE-GOLIVE-MASTER-01: `pg_dump`/`pg_restore` seguem ausentes desta máquina.
**PRIORIDADE:** alta antes de depender dele para um incidente real — validar também se o provider escolhido (item 3) já resolve isso via PITR nativo, o que tornaria este runbook um plano B, não a linha primária.

---

## 7. Worker do Job Engine em produção — host separado (Vercel é serverless)

**AÇÃO:** provisionar um host always-on (ex.: Railway/Render/Fly.io/VM pequena) para rodar `pnpm --filter web worker` continuamente ao lado do deploy Vercel, OU decidir reestruturar para Vercel Cron (mudança de código maior, ver `docs/PM_DEPLOY_READINESS.md` §11).
**MOTIVO:** `apps/web/src/scripts/job-worker.ts` é um poller de longa duração (loop contínuo) — estruturalmente incompatível com Vercel Functions (efêmeras, com timeout). Sem esse processo rodando em produção, nenhuma mensagem de WhatsApp enfileirada é de fato enviada (o webhook só enfileira).
**ONDE:** detalhado em `docs/PM_DEPLOY_READINESS.md`, seção "Cron / jobs em background".
**PRIORIDADE:** alta — bloqueia o funcionamento real do WhatsApp em produção, mesmo que o resto do app funcione normalmente na Vercel.

---

## 8. Provider de Postgres — Root Directory do projeto na Vercel

**AÇÃO:** ao criar o projeto na Vercel, configurar "Root Directory" = `apps/web` com "Include files outside the root directory" habilitado (monorepo pnpm — `apps/web` depende de `packages/db` via workspace), e o build command apontando para `pnpm --filter web run build`.
**MOTIVO:** configuração de infraestrutura que só pode ser feita no dashboard da Vercel no momento da criação do projeto — não é algo que o código resolva sozinho.
**PRIORIDADE:** alta — necessário para o primeiro deploy funcionar.
