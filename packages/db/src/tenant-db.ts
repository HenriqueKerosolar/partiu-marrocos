import type { Prisma, PrismaClient } from "@prisma/client";

export type TenantTx = Prisma.TransactionClient;

/**
 * Executa `fn` dentro de uma transação com o contexto de tenant setado na
 * sessão Postgres (`app.tenant_id`), que a policy `tenant_isolation` de todas
 * as tabelas com `tenant_id` usa via `current_tenant_id()` para filtrar
 * linhas (ver packages/db/prisma/rls.sql). Porte literal do CongáOne
 * (packages/db/src/tenant-db.ts), que segue o mesmo padrão do MercadoEase
 * (ADR-005).
 *
 * Isolamento é fail-closed por design: se este helper não for usado, a
 * variável de sessão fica indefinida e as policies retornam zero linhas (não
 * lançam erro, não vazam dado de outro tenant). `withTenant` existe para uso
 * ergonômico correto do dia a dia — não é ele quem garante o isolamento, é a
 * RLS no banco.
 *
 * `tenantId` DEVE vir da sessão autenticada validada no servidor, nunca de
 * input do cliente (body/query/params da request).
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error("withTenant: tenantId vazio — recusando executar sem contexto de tenant.");
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    // Achado real ao testar contra um banco remoto de verdade (Supabase) pela
    // primeira vez nesta rodada: o padrão do Prisma (5s) sempre foi suficiente
    // contra o Postgres local (latência ~0), mas nunca foi testado contra uma
    // conexão remota real — uma transação com várias queries sequenciais
    // (ex.: o seed, que faz upsert de cada permissão de cada papel em loop)
    // estoura os 5s só de latência de rede, mesmo sem nenhuma query lenta.
    { timeout: 15000 },
  );
}

/**
 * Escape hatch para operações legitimamente cross-tenant (ex.: descobrir a
 * quais empresas um usuário já autenticado pertence, no login/seleção de
 * empresa). Usa a mesma função `rls_bypass()` do CongáOne/MercadoEase — é uma
 * flag de sessão, não uma troca de role Postgres.
 *
 * Só chamar para as poucas operações que são inerentemente cross-tenant e já
 * filtradas por algo seguro (ex.: o próprio userId da sessão autenticada).
 * Nunca usar para "simplificar" uma query que deveria estar em withTenant.
 */
export async function withSystem<T>(
  prisma: PrismaClient,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx);
    },
    { timeout: 15000 },
  );
}
