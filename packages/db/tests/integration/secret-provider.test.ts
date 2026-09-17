import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, afterEach, describe, expect, it } from "vitest";
import { withSystem, withTenant } from "../../src/tenant-db";
import {
  configurarSecret,
  obterSecret,
  rotacionarSecret,
  removerSecret,
  getSecretProvider,
  SecretProviderIndisponivelError,
} from "../../src/secret-provider";

/**
 * PM-BLOQ-001 — testes negativos de segurança exigidos pela autorização
 * (mesmo critério das outras suítes deste pacote: tentar ativamente vazar/
 * burlar e falhar, não só "não vi vazar"). Nunca usa um valor real de
 * segredo — os valores de teste são strings óbvias de teste.
 */
const prisma = new PrismaClient();
const MASTER_KEY_ENV = "SECRET_PROVIDER_MASTER_KEY";
const masterKeyOriginal = process.env[MASTER_KEY_ENV];
const providerOriginal = process.env.SECRET_PROVIDER;

let tenantA: { id: string };
let tenantB: { id: string };

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (secret teste)", slug: `sec-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (secret teste)", slug: `sec-b-${Date.now()}` } });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } });
    await tx.tenant.delete({ where: { id: tenantB.id } });
  });
  await prisma.$disconnect();
}, 30000);

afterEach(() => {
  // Alguns testes mexem deliberadamente nessas env vars para simular
  // provider indisponível — sempre restaura, nunca deixa vazar pro próximo teste.
  if (masterKeyOriginal === undefined) delete process.env[MASTER_KEY_ENV];
  else process.env[MASTER_KEY_ENV] = masterKeyOriginal;
  if (providerOriginal === undefined) delete process.env.SECRET_PROVIDER;
  else process.env.SECRET_PROVIDER = providerOriginal;
});

describe("SecretProvider — round-trip básico", () => {
  it("salvar → obter devolve exatamente o valor original", async () => {
    const valor = "sk-teste-valor-original-12345";
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor,
      actorType: "HUMANO",
    });

    const recuperado = await obterSecret(prisma, { tenantId: tenantA.id, secretRef, actorType: "HUMANO" });
    expect(recuperado).toBe(valor);
  });

  it("o valor NUNCA fica em texto plano na tabela secrets — só o envelope cifrado", async () => {
    const valor = "sk-teste-nao-pode-aparecer-em-lugar-nenhum";
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor,
      actorType: "HUMANO",
    });

    const linha = await withTenant(prisma, tenantA.id, (tx) => tx.secret.findUniqueOrThrow({ where: { id: secretRef } }));
    expect(linha.ciphertext).not.toContain(valor);
    expect(JSON.stringify(linha)).not.toContain(valor);
  });
});

describe("SecretProvider — isolamento multi-tenant", () => {
  it("Tenant B não consegue obter o secretRef do Tenant A (nem sabendo o id)", async () => {
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: "valor-do-tenant-a",
      actorType: "HUMANO",
    });

    const resultado = await obterSecret(prisma, { tenantId: tenantB.id, secretRef, actorType: "HUMANO" });
    expect(resultado).toBeNull();
  });

  it("Tenant B não consegue rotacionar o secretRef do Tenant A", async () => {
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: "valor-original-a",
      actorType: "HUMANO",
    });

    const resultado = await rotacionarSecret(prisma, {
      tenantId: tenantB.id,
      secretRef,
      novoValor: "tentativa-de-sequestro-b",
      finalidade: "AI_PROVIDER_API_KEY",
      actorType: "HUMANO",
    });
    expect(resultado).toBeNull();

    // confirma que o valor original do tenant A continua intocado
    const aindaOriginal = await obterSecret(prisma, { tenantId: tenantA.id, secretRef, actorType: "HUMANO" });
    expect(aindaOriginal).toBe("valor-original-a");
  });

  it("Tenant B não consegue remover o secretRef do Tenant A", async () => {
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: "valor-que-nao-pode-ser-apagado-por-b",
      actorType: "HUMANO",
    });

    await removerSecret(prisma, { tenantId: tenantB.id, secretRef, finalidade: "AI_PROVIDER_API_KEY", actorType: "HUMANO" });

    // continua existindo e legível pelo dono de verdade (tenant A)
    const aindaLa = await obterSecret(prisma, { tenantId: tenantA.id, secretRef, actorType: "HUMANO" });
    expect(aindaLa).toBe("valor-que-nao-pode-ser-apagado-por-b");
  });

  it("sem contexto de tenant (nenhum withTenant/withSystem), nenhum secret é retornado — fail-closed", async () => {
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: "valor-sem-contexto",
      actorType: "HUMANO",
    });
    const linha = await prisma.secret.findUnique({ where: { id: secretRef } });
    expect(linha).toBeNull();
  });
});

describe("SecretProvider — rotação", () => {
  it("A configurado → usado → rotacionado para B → B é o valor em uso → A não é mais acessível", async () => {
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: "valor-A",
      actorType: "HUMANO",
    });
    expect(await obterSecret(prisma, { tenantId: tenantA.id, secretRef, actorType: "HUMANO" })).toBe("valor-A");

    const rotacionado = await rotacionarSecret(prisma, {
      tenantId: tenantA.id,
      secretRef,
      novoValor: "valor-B",
      finalidade: "AI_PROVIDER_API_KEY",
      actorType: "HUMANO",
    });
    expect(rotacionado?.secretRef).toBe(secretRef); // MESMO secretRef — domínio não precisa mudar nada

    const depois = await obterSecret(prisma, { tenantId: tenantA.id, secretRef, actorType: "HUMANO" });
    expect(depois).toBe("valor-B");
    expect(depois).not.toBe("valor-A");
  });

  it("rotacionar um secretRef inexistente devolve null (não cria nada, não lança)", async () => {
    const resultado = await rotacionarSecret(prisma, {
      tenantId: tenantA.id,
      secretRef: "id-que-nao-existe",
      novoValor: "x",
      finalidade: "AI_PROVIDER_API_KEY",
      actorType: "HUMANO",
    });
    expect(resultado).toBeNull();
  });
});

describe("SecretProvider — remoção", () => {
  it("removido → obter devolve null", async () => {
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: "valor-a-remover",
      actorType: "HUMANO",
    });
    await removerSecret(prisma, { tenantId: tenantA.id, secretRef, finalidade: "AI_PROVIDER_API_KEY", actorType: "HUMANO" });

    const resultado = await obterSecret(prisma, { tenantId: tenantA.id, secretRef, actorType: "HUMANO" });
    expect(resultado).toBeNull();
  });

  it("remover um secretRef já removido é idempotente (não lança)", async () => {
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: "valor-remocao-dupla",
      actorType: "HUMANO",
    });
    await removerSecret(prisma, { tenantId: tenantA.id, secretRef, finalidade: "AI_PROVIDER_API_KEY", actorType: "HUMANO" });
    await expect(
      removerSecret(prisma, { tenantId: tenantA.id, secretRef, finalidade: "AI_PROVIDER_API_KEY", actorType: "HUMANO" }),
    ).resolves.not.toThrow();
  });
});

describe("SecretProvider — fail-closed quando o provider está indisponível", () => {
  it("obterSecret sem SECRET_PROVIDER_MASTER_KEY configurada devolve null (nunca lança, nunca cai para texto plano)", async () => {
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: "valor-com-master-key-presente",
      actorType: "HUMANO",
    });

    delete process.env[MASTER_KEY_ENV];
    const resultado = await obterSecret(prisma, { tenantId: tenantA.id, secretRef, actorType: "AGENTE", actorLabel: "yalla" });
    expect(resultado).toBeNull();
  });

  it("falha de provider grava SECRET_ACCESS_FAILED (metadados apenas, nunca o valor)", async () => {
    const valor = "valor-que-nao-pode-vazar-no-audit-log";
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor,
      actorType: "HUMANO",
    });

    delete process.env[MASTER_KEY_ENV];
    const resultado = await obterSecret(prisma, { tenantId: tenantA.id, secretRef, actorType: "AGENTE", actorLabel: "yalla" });
    expect(resultado).toBeNull();

    const eventos = await withTenant(prisma, tenantA.id, (tx) =>
      tx.auditLog.findMany({ where: { tenantId: tenantA.id, entidadeId: secretRef, acao: "SECRET_ACCESS_FAILED" } }),
    );
    expect(eventos.length).toBeGreaterThan(0);
    const serializado = JSON.stringify(eventos);
    expect(serializado).not.toContain(valor);
  });

  it("getSecretProvider com SECRET_PROVIDER desconhecido lança um erro claro (nunca escolhe um vendor por conta própria)", () => {
    process.env.SECRET_PROVIDER = "aws-secrets-manager";
    expect(() => getSecretProvider(prisma)).toThrow(SecretProviderIndisponivelError);
  });

  it("configurarSecret com provider indisponível lança (escrita síncrona — não é um fallback silencioso) e grava SECRET_ACCESS_FAILED", async () => {
    delete process.env[MASTER_KEY_ENV];
    await expect(
      configurarSecret(prisma, { tenantId: tenantA.id, finalidade: "AI_PROVIDER_API_KEY", valor: "x", actorType: "HUMANO" }),
    ).rejects.toThrow(SecretProviderIndisponivelError);

    const eventos = await withTenant(prisma, tenantA.id, (tx) =>
      tx.auditLog.findMany({ where: { tenantId: tenantA.id, acao: "SECRET_ACCESS_FAILED" }, orderBy: { createdAt: "desc" }, take: 1 }),
    );
    expect(eventos).toHaveLength(1);
  });
});

describe("SecretProvider — auditoria nunca contém o valor, mesmo no caminho feliz", () => {
  it("SECRET_CONFIGURED/SECRET_ROTATED/SECRET_REMOVED nunca trazem o valor em detalhe", async () => {
    const valorInicial = "valor-inicial-nao-pode-vazar";
    const valorRotacionado = "valor-rotacionado-nao-pode-vazar";

    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: valorInicial,
      actorType: "HUMANO",
    });
    await rotacionarSecret(prisma, {
      tenantId: tenantA.id,
      secretRef,
      novoValor: valorRotacionado,
      finalidade: "AI_PROVIDER_API_KEY",
      actorType: "HUMANO",
    });
    await removerSecret(prisma, { tenantId: tenantA.id, secretRef, finalidade: "AI_PROVIDER_API_KEY", actorType: "HUMANO" });

    const eventos = await withTenant(prisma, tenantA.id, (tx) => tx.auditLog.findMany({ where: { tenantId: tenantA.id, entidadeId: secretRef } }));
    expect(eventos.map((e) => e.acao).sort()).toEqual(["SECRET_CONFIGURED", "SECRET_REMOVED", "SECRET_ROTATED"]);

    const serializado = JSON.stringify(eventos);
    expect(serializado).not.toContain(valorInicial);
    expect(serializado).not.toContain(valorRotacionado);
  });
});

describe("SecretProvider — não amplia a exceção de audit log append-only criada em T1", () => {
  it("uma tentativa de UPDATE/DELETE em audit_logs continua bloqueada mesmo depois de operações de secret", async () => {
    const { secretRef } = await configurarSecret(prisma, {
      tenantId: tenantA.id,
      finalidade: "AI_PROVIDER_API_KEY",
      valor: "valor-para-teste-append-only",
      actorType: "HUMANO",
    });
    const evento = await withTenant(prisma, tenantA.id, (tx) =>
      tx.auditLog.findFirstOrThrow({ where: { tenantId: tenantA.id, entidadeId: secretRef, acao: "SECRET_CONFIGURED" } }),
    );

    await expect(
      withTenant(prisma, tenantA.id, (tx) => tx.$executeRaw`UPDATE audit_logs SET resultado = 'adulterado' WHERE id = ${evento.id}`),
    ).rejects.toThrow(/append-only/);
  });
});
