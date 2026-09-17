# Partiu Marrocos — TODO Humano Final

Só itens que dependem de decisão/credencial/aprovação externa — nada aqui é corrigível por código. Consolida achados de PM-CONV-07 a PM-CONV-12.

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

## 6. Rate limiter distribuído (multi-instância Vercel)

**AÇÃO:** decidir entre (a) implementar um contador atômico em Postgres (sem credencial nova, mas exige uma rodada própria de stress-test, mesmo rigor do Job Engine §5E) ou (b) adotar Redis/Upstash (credencial nova).
**MOTIVO:** o rate limiter atual (`apps/web/src/lib/rate-limit.ts`) é em memória, por instância — funciona corretamente hoje (single-instance dev), mas sob múltiplas instâncias Vercel cada uma teria seu próprio contador.
**PRIORIDADE:** média — nenhuma rota protegida por ele é hoje um alvo de abuso conhecido; vale endereçar antes de tráfego real de produção em escala.

---

## 7. Backup/DR — teste real de restore

**AÇÃO:** rodar o runbook (`docs/PM_BACKUP_RESTORE_DR.md`) num ambiente com `pg_dump`/`pg_restore` instalados (esta máquina de dev não tem — usa `embedded-postgres`, que não empacota essas ferramentas), confirmando o checklist de verificação pós-restore.
**MOTIVO:** o runbook usa comandos padrão PostgreSQL corretos, mas nunca foi executado ponta a ponta nesta sessão — declarado honestamente, não escondido.
**PRIORIDADE:** alta antes de depender dele para um incidente real — validar também se o provider escolhido (item 3) já resolve isso via PITR nativo, o que tornaria este runbook um plano B, não a linha primária.

---

## 8. Git — repositório ainda não inicializado

**AÇÃO:** decidir se/quando rodar `git init` neste projeto.
**MOTIVO:** decisão de infraestrutura registrada desde o PM-CONV-04, ainda pendente — não bloqueia nenhum trabalho técnico até aqui, mas impede versionamento/rollback real e complica qualquer deploy via CI baseado em Git (incluindo Vercel, que normalmente conecta a um repositório).
**PRIORIDADE:** alta se o deploy real (Vercel) for acontecer em breve — Vercel tipicamente precisa de um repositório Git conectado.
