import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma, withSystem, withTenant, criarProposta, enviarProposta, aceitarProposta, criarBookingDaProposta, criarPayment, registrarResultadoPayment, listarContasAReceber } from "../../src";

/**
 * Contas a receber (PM-NIGHT-RUN-02, Etapa 3, §19) — consulta computada
 * sobre `Payment`, NUNCA uma tabela paralela (ver comentário de
 * `receivables.ts`). Prova que a consulta reflete o estado real de
 * `Payment` sem duplicar/divergir.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };
let leadA: { id: string };

const VALIDADE_FUTURA = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

async function criarLeadPara(tenantId: string, sufixo: string) {
  return withTenant(prisma, tenantId, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId, nome: `Funil ${sufixo}` } });
    const stage = await tx.stage.create({ data: { tenantId, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId, nome: `Cliente ${sufixo}` } });
    return tx.lead.create({ data: { tenantId, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
  });
}

async function criarBookingDePreco(tenantId: string, leadId: string, preco: number) {
  const p = await criarProposta(prisma, { tenantId, leadId, moeda: "BRL", preco, validade: VALIDADE_FUTURA() });
  await enviarProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  await aceitarProposta(prisma, { tenantId, propostaId: p.id });
  const r = await criarBookingDaProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  if (!r.ok) throw new Error("esperava criação de booking");
  return r.booking;
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (receivables teste)", slug: `rec-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (receivables teste)", slug: `rec-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `rec-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: role.id } });
  });
  leadA = await criarLeadPara(tenantA.id, "A");
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } });
    await tx.tenant.delete({ where: { id: tenantB.id } });
  });
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.payment.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("listarContasAReceber — computada a partir de Payment, nunca duplicada", () => {
  it("Payment PENDENTE aparece como conta a receber", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", vencimento: VALIDADE_FUTURA(), actorType: "HUMANO", userId: userA.id });

    const contas = await listarContasAReceber(prisma, tenantA.id);
    expect(contas).toHaveLength(1);
    expect(contas[0]!.valor).toBe(10000);
    expect(contas[0]!.bookingId).toBe(booking.id);
    expect(contas[0]!.leadId).toBe(leadA.id);
  });

  it("Payment PAGO desaparece da lista de contas a receber (já foi liquidado)", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação");
    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });

    const contas = await listarContasAReceber(prisma, tenantA.id);
    expect(contas).toHaveLength(0);
  });

  it("Payment PARCIALMENTE_PAGO continua aparecendo (ainda tem saldo em aberto)", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação");
    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "PARCIALMENTE_PAGO", actorType: "HUMANO", userId: userA.id });

    const contas = await listarContasAReceber(prisma, tenantA.id);
    expect(contas).toHaveLength(1);
    expect(contas[0]!.status).toBe("PARCIALMENTE_PAGO");
  });

  it("filtro vencendoAte restringe corretamente", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 20000);
    await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", vencimento: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), actorType: "HUMANO", userId: userA.id });
    await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", vencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), actorType: "HUMANO", userId: userA.id });

    const contas = await listarContasAReceber(prisma, tenantA.id, { vencendoAte: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) });
    expect(contas).toHaveLength(1);
    expect(contas[0]!.valor).toBe(10000);
  });

  it("isolamento multi-tenant: Tenant B nunca vê contas a receber do Tenant A", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });

    const contasB = await listarContasAReceber(prisma, tenantB.id);
    expect(contasB).toHaveLength(0);
  });
});
