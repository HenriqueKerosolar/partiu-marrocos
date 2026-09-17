import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { DEFAULT_ROLES, PERMISSIONS } from "./permissions";
import { withTenant, withSystem } from "./tenant-db";
import { provisionarGrantsPadrao, CAPABILITIES_PADRAO_YALLA } from "./tools";

const prisma = new PrismaClient();

const DEMO_TENANT_SLUG = "partiu-marrocos";
const DEMO_ADMIN_EMAIL = "admin@partiumarrocos.local";

async function seedPermissionCatalog() {
  // "permissions" é catálogo global, sem RLS — grava direto.
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { chave: permission.chave },
      update: { descricao: permission.descricao },
      create: permission,
    });
  }
}

async function seedDemoTenant() {
  // "tenants" também não tem RLS (é o próprio registro de tenants).
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: {},
    create: { nome: "Partiu Marrocos", slug: DEMO_TENANT_SLUG, moeda: "BRL" },
  });

  // Senha gerada aleatoriamente a cada criação (nunca hardcoded) — impressa
  // uma única vez no console. Em execuções seguintes (usuário já existe), a
  // senha não é tocada.
  const existingUser = await prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } });
  const generatedPassword = existingUser ? null : randomBytes(12).toString("base64url");
  const passwordHash = existingUser
    ? existingUser.passwordHash
    : await bcrypt.hash(generatedPassword!, 12);

  const user = await prisma.user.upsert({
    where: { email: DEMO_ADMIN_EMAIL },
    update: {},
    create: { email: DEMO_ADMIN_EMAIL, passwordHash, mustChangePassword: true },
  });

  // Daqui pra baixo, tudo tem tenant_id + RLS — sempre dentro do contexto do
  // tenant recém-criado, nunca via bypass.
  await withTenant(prisma, tenant.id, async (tx) => {
    const permissions = await tx.permission.findMany();
    const permissionByKey = new Map(permissions.map((p) => [p.chave, p]));

    for (const roleDef of DEFAULT_ROLES) {
      const role = await tx.role.upsert({
        where: { tenantId_nome: { tenantId: tenant.id, nome: roleDef.nome } },
        update: { descricao: roleDef.descricao },
        create: {
          tenantId: tenant.id,
          nome: roleDef.nome,
          descricao: roleDef.descricao,
          isDefault: true,
        },
      });

      for (const chave of roleDef.permissoes) {
        const permission = permissionByKey.get(chave);
        if (!permission) continue;
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
      }
    }

    const adminRole = await tx.role.findUniqueOrThrow({
      where: { tenantId_nome: { tenantId: tenant.id, nome: "Administrador" } },
    });

    await tx.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: { roleId: adminRole.id },
      create: { userId: user.id, tenantId: tenant.id, roleId: adminRole.id },
    });

    const pipeline = await tx.pipeline.upsert({
      where: { id: `${tenant.id}-default` }, // não há @unique composto pronto; ver nota abaixo
      update: {},
      create: { id: `${tenant.id}-default`, tenantId: tenant.id, nome: "Funil padrão", isDefault: true },
    });

    const estagios = [
      { nome: "Novo lead" },
      { nome: "Contato feito" },
      { nome: "Proposta enviada" },
      { nome: "Fechado", isWon: true },
      { nome: "Perdido", isLost: true },
    ];
    for (let i = 0; i < estagios.length; i++) {
      const e = estagios[i]!;
      await tx.stage.upsert({
        where: { id: `${pipeline.id}-${i}` },
        update: { nome: e.nome, ordem: i, isWon: !!e.isWon, isLost: !!e.isLost },
        create: { id: `${pipeline.id}-${i}`, tenantId: tenant.id, pipelineId: pipeline.id, nome: e.nome, ordem: i, isWon: !!e.isWon, isLost: !!e.isLost },
      });
    }
  });

  // Grants do agente Yalla (T3, default-deny) — fora do withTenant acima de
  // propósito: `provisionarGrantsPadrao` já abre seu próprio withTenant por
  // capability (mesmo padrão de concederCapability). Idempotente — reseed
  // não duplica nem sobrescreve nada além de reativar se alguém tivesse
  // revogado manualmente.
  await provisionarGrantsPadrao(prisma, {
    tenantId: tenant.id,
    agent: "yalla",
    capabilities: CAPABILITIES_PADRAO_YALLA,
    actorType: "SISTEMA",
    actorLabel: "seed",
  });

  return { tenant, user, generatedPassword };
}

async function main() {
  await seedPermissionCatalog();
  const { tenant, user, generatedPassword } = await seedDemoTenant();

  // Confere, com withSystem (a mesma leitura cross-tenant do login), que o
  // vínculo ficou visível — só como checagem de sanidade do próprio seed.
  await withSystem(prisma, (tx) => tx.membership.findFirstOrThrow({ where: { userId: user.id } }));

  console.log("Seed concluído.");
  console.log(`Tenant demo: ${tenant.nome} (slug: ${tenant.slug})`);
  console.log(`Login: ${user.email}`);
  if (generatedPassword) {
    console.log(`Senha (anote agora, não será mostrada de novo): ${generatedPassword}`);
  } else {
    console.log("Usuário já existia — senha não alterada.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
