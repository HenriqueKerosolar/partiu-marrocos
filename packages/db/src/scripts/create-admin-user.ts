import bcrypt from "bcryptjs";
import { prisma, withSystem, withTenant } from "../index";

/**
 * Script único, sob demanda — cria/atualiza um usuário e o vincula como
 * Administrador de um tenant existente. Não faz parte do seed automático
 * (não deve rodar em todo `db:seed`); uso manual via `tsx`.
 */
async function main() {
  const TENANT_ID = process.argv[2];
  const email = process.argv[3];
  const senha = process.argv[4];
  if (!TENANT_ID || !email || !senha) {
    throw new Error("uso: tsx create-admin-user.ts <tenantId> <email> <senha>");
  }

  const passwordHash = await bcrypt.hash(senha, 12);

  const user = await withSystem(prisma, (tx) =>
    tx.user.upsert({
      where: { email },
      update: { passwordHash, mustChangePassword: false, status: "ATIVO" },
      create: { email, passwordHash, mustChangePassword: false, status: "ATIVO" },
    }),
  );

  await withTenant(prisma, TENANT_ID, async (tx) => {
    const adminRole = await tx.role.findFirstOrThrow({ where: { tenantId: TENANT_ID, nome: "Administrador" } });
    await tx.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: TENANT_ID } },
      update: { roleId: adminRole.id },
      create: { userId: user.id, tenantId: TENANT_ID, roleId: adminRole.id },
    });
  });

  console.log(`OK — usuário ${user.id} (${email}) vinculado como Administrador do tenant ${TENANT_ID}. Nunca imprime a senha.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
