# Partiu Marrocos — Backup, Restore e Disaster Recovery

**Status: documentação real (comandos padrão PostgreSQL, verificados contra a documentação oficial) — não testada ponta a ponta neste ambiente porque `pg_dump`/`pg_restore` não estão instalados aqui.**

## Por que este documento existe

Auditoria de segurança (PM-CONV-11) confirmou: **nenhum script de backup/restore e nenhuma documentação de DR existiam** no repositório antes desta rodada. Isso é registrado aqui honestamente — os comandos abaixo são padrão PostgreSQL (`pg_dump`/`pg_restore`), estáveis e bem documentados, mas **não foram executados neste ambiente** porque as ferramentas cliente do PostgreSQL não estão instaladas nesta máquina de desenvolvimento (confirmado: `pg_dump`/`pg_restore` ausentes do PATH; o Postgres local de dev roda via `embedded-postgres`, que só empacota `postgres.exe`/`pg_ctl.exe`/`initdb.exe`, sem as ferramentas de dump/restore). Isso não é uma falha de execução — é uma limitação honesta declarada, não escondida.

## Pré-requisitos para usar este runbook

1. Cliente PostgreSQL instalado (`pg_dump`, `pg_restore`, `psql`) — versão compatível com o servidor (Postgres 16, mesma versão do `embedded-postgres` usado em dev). Em qualquer ambiente com PostgreSQL instalado (a maioria das distribuições Linux de CI, ou `apt install postgresql-client`/`brew install postgresql`), essas ferramentas já vêm juntas.
2. Acesso à `DATABASE_URL` (ou, preferencialmente para backup — que não deve competir com o connection pool da aplicação — à `DIRECT_URL`, já presente em `.env`/`.env.example` desde o PM-CONV-05).

## Backup manual (sob demanda)

```bash
# Dump completo, formato custom (permite restore seletivo/paralelo, comprimido por padrão)
pg_dump "$DIRECT_URL" --format=custom --file="partiumarrocos-$(date +%Y%m%d-%H%M%S).dump"
```

Formato `--format=custom` (não `--format=plain`/SQL puro) é a escolha deliberada: permite `pg_restore --list` pra inspecionar o conteúdo sem restaurar, restore seletivo de uma tabela só, e restore em paralelo (`--jobs`) em bancos grandes — nenhuma dessas capacidades existe com um dump SQL plano.

## Restore (verificação, nunca contra o banco de produção diretamente)

```bash
# 1. Criar um banco de verificação separado — NUNCA restaurar por cima de um banco vivo
createdb -h <host> -U <user> partiumarrocos_restore_verificacao

# 2. Restaurar o dump nesse banco separado
pg_restore --dbname="postgresql://<user>@<host>/partiumarrocos_restore_verificacao" --no-owner --no-privileges partiumarrocos-<timestamp>.dump

# 3. Verificar integridade antes de considerar o backup válido (ver checklist abaixo)

# 4. Descartar o banco de verificação depois de confirmado
dropdb -h <host> -U <user> partiumarrocos_restore_verificacao
```

**Nunca `pg_restore` direto sobre um banco em uso** — o fluxo correto pra uma recuperação real é: restaurar num banco novo, verificar, e só então trocar a `DATABASE_URL`/`DIRECT_URL` da aplicação pra apontar pro banco restaurado (ou renomear bancos), nunca sobrescrever o banco vivo no lugar.

## Checklist de verificação pós-restore (mínimo)

- [ ] `SELECT count(*) FROM tenants;` — não-zero, bate com a contagem esperada.
- [ ] `SELECT count(*) FROM audit_logs;` — o log de auditoria (append-only) restaurou junto, sem gap.
- [ ] RLS ainda ativo: `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'leads';` — ambos `t` (true). `pg_restore` recria a policy junto do schema (está no dump), mas confirmar depois de qualquer restore é o hábito certo, nunca presumir.
- [ ] Uma consulta cross-tenant real (duas contas de teste, tentar ler uma da outra) continua falhando depois do restore — mesma prova que os testes de isolamento já fazem, mas contra o banco restaurado de verdade.
- [ ] Migrations: `prisma migrate status` no banco restaurado bate com o estado esperado (nenhuma migration "perdida" pelo timestamp do dump).

## RPO / RTO — alvos propostos (não comprometidos ainda — decisão do usuário)

Nenhum SLA foi acordado até hoje porque a **produção ainda não está no ar** (Vercel + provider de Postgres a decidir, conforme `project_hosting_vercel` já registrado). Alvos propostos, pra decisão quando a produção existir:

| Métrica | Proposta | Justificativa |
|---|---|---|
| RPO (perda máxima de dado aceitável) | ≤ 24h, idealmente near-zero via PITR do provider | Provedores gerenciados de Postgres compatíveis com Vercel (Neon, Supabase, RDS) já oferecem **Point-in-Time Recovery contínuo** — recomendação: usar o PITR nativo do provider como linha de defesa primária, este runbook como plano B independente do provider. |
| RTO (tempo até religar) | ≤ 2h pra um restore manual verificado | Depende do tamanho do banco no momento — reavaliar quando houver volume real de produção. |

**Isto é uma proposta, não uma decisão tomada por mim** — RPO/RTO são compromissos de negócio, não uma escolha técnica unilateral.

## Recomendação: PITR do provider como linha primária

Como o provider de Postgres de produção ainda está em aberto (memória do projeto: "production Postgres provider still undecided"), a recomendação é que a decisão de provider já leve em conta backup/PITR nativo (Neon e Supabase, os dois candidatos naturais pra Postgres serverless compatível com Vercel, oferecem os dois). Este runbook (`pg_dump`/`pg_restore`) é o plano B universal — funciona com qualquer Postgres, independente de qual provider for escolhido — não uma substituição do backup gerenciado do provider.

## Automação futura (não implementada nesta rodada)

Um job agendado de backup (via GitHub Actions/cron externo, nunca dentro do próprio Job Engine da aplicação — backup não deveria depender da própria aplicação estar de pé) é a evolução natural deste runbook manual. Não implementado agora por decisão de escopo: exigiria decidir onde esse cron roda (fora do escopo desta rodada, que é sobre a aplicação, não sobre infraestrutura de CI/CD) e para onde os dumps são enviados (S3/Backblaze/etc. — nova credencial, `WAITING_EXTERNAL`).
