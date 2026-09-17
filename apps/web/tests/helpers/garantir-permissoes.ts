import { PERMISSIONS, prisma as prismaSingleton } from "@partiumarrocos/db";

type PrismaClient = typeof prismaSingleton;

/**
 * T5-FIX — corrige uma flake real de teste: `vitest run` roda arquivos de
 * teste em paralelo por padrão, cada um com sua própria conexão Prisma. O
 * padrão antigo (`for (const perm of PERMISSIONS) { await
 * prisma.permission.upsert(...) }` repetido em cada arquivo) não é atômico
 * o bastante sob essa concorrência real — duas conexões podem ver "a
 * permissão não existe" ao mesmo tempo e ambas tentarem INSERT, uma delas
 * recebendo "Unique constraint failed on the fields: (chave)" em vez do
 * upsert resolver silenciosamente (confirmado nos logs de
 * `gates-route.test.ts`/`secret-provider-wiring.test.ts`).
 *
 * `INSERT ... ON CONFLICT (chave) DO NOTHING` é atômico de verdade — mesmo
 * padrão já comprovado em `cost-control.ts::ajustarCostUsage` e
 * `tools/broker.ts::reservarToolCall` para reservas concorrentes — nunca
 * lança em conflito, nunca precisa de retry/catch. Não muda nenhuma regra
 * de negócio: o catálogo de permissões continua vindo de `PERMISSIONS`
 * (packages/db/src/permissions.ts), só a forma de semeá-lo em teste sob
 * concorrência real é que muda.
 */
export async function garantirPermissoes(prisma: PrismaClient): Promise<void> {
  for (const perm of PERMISSIONS) {
    await prisma.$executeRaw`
      INSERT INTO permissions (id, chave, descricao)
      VALUES (gen_random_uuid()::text, ${perm.chave}, ${perm.descricao})
      ON CONFLICT (chave) DO NOTHING
    `;
  }
}
