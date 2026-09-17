import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, withSystem } from "../../src/tenant-db";
import { findWhatsappAccountByPhoneNumberId, findWhatsappAccountByVerifyToken } from "../../src/cross-tenant";

/**
 * Isolamento multi-tenant do domínio WhatsApp Cloud API — mesmo formato dos
 * outros testes negativos deste pacote (tentar vazar de propósito e falhar).
 * `phoneNumberId`/`verifyToken` são resolvidos ANTES de haver tenant no
 * contexto (mesma situação estrutural do login) — por isso o teste também
 * cobre que essa busca cross-tenant devolve exatamente a conta certa, nunca
 * uma de outro tenant.
 */
const prisma = new PrismaClient();

let tenantA: { id: string };
let tenantB: { id: string };
let contaA: { id: string; phoneNumberId: string; verifyToken: string };
let contaB: { id: string; phoneNumberId: string; verifyToken: string };

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (wa teste)", slug: `wa-teste-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (wa teste)", slug: `wa-teste-b-${Date.now()}` } });

  contaA = await withTenant(prisma, tenantA.id, (tx) =>
    tx.whatsappAccount.create({
      data: {
        tenantId: tenantA.id,
        label: "Conta A",
        phoneNumberId: `pnid-a-${Date.now()}`,
        accessTokenSecretRef: "secret-ref-fake-a",
        verifyToken: `verify-a-${Date.now()}`,
      },
    }),
  );
  contaB = await withTenant(prisma, tenantB.id, (tx) =>
    tx.whatsappAccount.create({
      data: {
        tenantId: tenantB.id,
        label: "Conta B",
        phoneNumberId: `pnid-b-${Date.now()}`,
        accessTokenSecretRef: "secret-ref-fake-b",
        verifyToken: `verify-b-${Date.now()}`,
      },
    }),
  );
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } });
    await tx.tenant.delete({ where: { id: tenantB.id } });
  });
  await prisma.$disconnect();
}, 30000);

describe("isolamento multi-tenant — WhatsApp Cloud API", () => {
  it("findWhatsappAccountByPhoneNumberId resolve a conta certa, nunca a de outro tenant", async () => {
    const achada = await findWhatsappAccountByPhoneNumberId(prisma, contaA.phoneNumberId);
    expect(achada?.id).toBe(contaA.id);
    expect(achada?.tenantId).toBe(tenantA.id);

    const achadaB = await findWhatsappAccountByPhoneNumberId(prisma, contaB.phoneNumberId);
    expect(achadaB?.id).toBe(contaB.id);
  });

  it("findWhatsappAccountByPhoneNumberId com id desconhecido retorna null (nunca a conta errada)", async () => {
    const achada = await findWhatsappAccountByPhoneNumberId(prisma, "pnid-nao-existe-nunca");
    expect(achada).toBeNull();
  });

  it("findWhatsappAccountByVerifyToken resolve a conta certa pelo verify token", async () => {
    const achada = await findWhatsappAccountByVerifyToken(prisma, contaA.verifyToken);
    expect(achada?.id).toBe(contaA.id);
  });

  it("sem contexto de tenant, nenhuma conta é retornada (fail-closed)", async () => {
    const contas = await prisma.whatsappAccount.findMany({ where: { id: { in: [contaA.id, contaB.id] } } });
    expect(contas).toHaveLength(0);
  });

  it("com o tenant A selecionado, só vejo a conta do tenant A", async () => {
    const contas = await withTenant(prisma, tenantA.id, (tx) =>
      tx.whatsappAccount.findMany({ where: { id: { in: [contaA.id, contaB.id] } } }),
    );
    expect(contas.map((c) => c.id)).toEqual([contaA.id]);
  });

  it("Conversation: não pode ser criada no tenant B apontando accountId da conta do tenant A (FK composta)", async () => {
    const contatoB = await withTenant(prisma, tenantB.id, (tx) =>
      tx.contact.create({ data: { tenantId: tenantB.id, nome: "Contato B (wa)" } }),
    );
    await expect(
      withTenant(prisma, tenantB.id, (tx) =>
        tx.conversation.create({
          data: { tenantId: tenantB.id, contactId: contatoB.id, accountId: contaA.id, channel: "WHATSAPP" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("Message: dedup real por (tenantId, externalId) — segunda tentativa com o mesmo externalId falha", async () => {
    const contatoA = await withTenant(prisma, tenantA.id, (tx) =>
      tx.contact.create({ data: { tenantId: tenantA.id, nome: "Contato A (wa dedup)", whatsappId: `55119${Date.now()}` } }),
    );
    const conversa = await withTenant(prisma, tenantA.id, (tx) =>
      tx.conversation.create({
        data: { tenantId: tenantA.id, contactId: contatoA.id, accountId: contaA.id, channel: "WHATSAPP" },
      }),
    );
    const externalId = `wamid.teste.${Date.now()}`;
    await withTenant(prisma, tenantA.id, (tx) =>
      tx.message.create({
        data: { tenantId: tenantA.id, conversationId: conversa.id, direction: "ENTRADA", senderType: "CONTATO", conteudo: "oi", externalId },
      }),
    );
    await expect(
      withTenant(prisma, tenantA.id, (tx) =>
        tx.message.create({
          data: { tenantId: tenantA.id, conversationId: conversa.id, direction: "ENTRADA", senderType: "CONTATO", conteudo: "oi de novo", externalId },
        }),
      ),
    ).rejects.toThrow();
  });

  it("Contact: dedup real por (tenantId, whatsappId) — segundo contato com o mesmo whatsappId no mesmo tenant falha", async () => {
    const whatsappId = `5511${Date.now()}`;
    await withTenant(prisma, tenantA.id, (tx) =>
      tx.contact.create({ data: { tenantId: tenantA.id, nome: "Primeiro", whatsappId } }),
    );
    await expect(
      withTenant(prisma, tenantA.id, (tx) =>
        tx.contact.create({ data: { tenantId: tenantA.id, nome: "Duplicado", whatsappId } }),
      ),
    ).rejects.toThrow();
  });

  it("Contact: o MESMO whatsappId pode existir em tenants diferentes (não é global, é por tenant)", async () => {
    const whatsappId = `5511${Date.now()}9`;
    const a = await withTenant(prisma, tenantA.id, (tx) =>
      tx.contact.create({ data: { tenantId: tenantA.id, nome: "Contato A mesmo número", whatsappId } }),
    );
    const b = await withTenant(prisma, tenantB.id, (tx) =>
      tx.contact.create({ data: { tenantId: tenantB.id, nome: "Contato B mesmo número", whatsappId } }),
    );
    expect(a.id).not.toBe(b.id);
  });
});
