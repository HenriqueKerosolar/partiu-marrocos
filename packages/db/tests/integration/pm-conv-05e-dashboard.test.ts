import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withSystem,
  withTenant,
  criarTrip,
  criarTourVehicle,
  criarTripGroup,
  criarProposta,
  criarBookingDaProposta,
  adicionarTraveler,
  obterDashboardExecutivo,
} from "../../src";

/**
 * PM-CONV-05, Track E — Dashboard Executivo. `obterDashboardExecutivo` só
 * compõe dado real — a suíte cobre: nunca soma moedas diferentes juntas,
 * margem só conta reserva com custos informados, ocupação null quando não
 * há capacidade pra calcular.
 */
let tenantA: { id: string };
let userA: { id: string };
let pipeline: { id: string };
let stage: { id: string };
let contact: { id: string };

const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function criarLead() {
  return withTenant(prisma, tenantA.id, (tx) => tx.lead.create({ data: { tenantId: tenantA.id, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } }));
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (dashboard teste)", slug: `dash-a-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `dash-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withTenant(prisma, tenantA.id, async (tx) => {
    pipeline = await tx.pipeline.create({ data: { tenantId: tenantA.id, nome: "Funil dashboard", isDefault: true } });
    stage = await tx.stage.create({ data: { tenantId: tenantA.id, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    contact = await tx.contact.create({ data: { tenantId: tenantA.id, nome: "Cliente Dashboard" } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantA.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.payment.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.booking.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.proposal.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tripGroup.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tourVehicle.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.trip.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.lead.deleteMany({ where: { tenantId: tenantA.id } });
  });
});

describe("obterDashboardExecutivo — funil", () => {
  it("conta leads por etapa do pipeline padrão", async () => {
    await criarLead();
    await criarLead();
    const dash = await obterDashboardExecutivo(prisma, tenantA.id);
    const etapaNovo = dash.funil.find((f) => f.etapa === "Novo");
    expect(etapaNovo?.leads).toBe(2);
  });
});

describe("obterDashboardExecutivo — financeiro nunca mistura moedas", () => {
  it("recebido/a-receber vêm agrupados por moeda, nunca somados juntos", async () => {
    const lead = await criarLead();
    const propostaBRL = await criarProposta(prisma, { tenantId: tenantA.id, leadId: lead.id, moeda: "BRL", preco: 5000, validade: dias(30) });
    await withTenant(prisma, tenantA.id, (tx) => tx.proposal.update({ where: { id: propostaBRL.id }, data: { status: "ACEITA" } }));
    const bookingBRL = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: propostaBRL.id, actorType: "HUMANO", userId: userA.id });
    if (!bookingBRL.ok) throw new Error("esperava booking");
    await withTenant(prisma, tenantA.id, (tx) => tx.payment.create({ data: { tenantId: tenantA.id, bookingId: bookingBRL.booking.id, valor: 5000, moeda: "BRL", status: "PAGO" } }));

    const lead2 = await criarLead();
    const propostaEUR = await criarProposta(prisma, { tenantId: tenantA.id, leadId: lead2.id, moeda: "EUR", preco: 1000, validade: dias(30) });
    await withTenant(prisma, tenantA.id, (tx) => tx.proposal.update({ where: { id: propostaEUR.id }, data: { status: "ACEITA" } }));
    const bookingEUR = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: propostaEUR.id, actorType: "HUMANO", userId: userA.id });
    if (!bookingEUR.ok) throw new Error("esperava booking");
    await withTenant(prisma, tenantA.id, (tx) => tx.payment.create({ data: { tenantId: tenantA.id, bookingId: bookingEUR.booking.id, valor: 1000, moeda: "EUR", status: "PAGO" } }));

    const dash = await obterDashboardExecutivo(prisma, tenantA.id);
    expect(dash.financeiro.recebido).toEqual(expect.arrayContaining([{ moeda: "BRL", valor: 5000 }, { moeda: "EUR", valor: 1000 }]));
    expect(dash.financeiro.recebido).toHaveLength(2);
  });
});

describe("obterDashboardExecutivo — margem só com custos informados", () => {
  it("não conta reserva sem Proposal.custos", async () => {
    const lead = await criarLead();
    const proposta = await criarProposta(prisma, { tenantId: tenantA.id, leadId: lead.id, moeda: "BRL", preco: 5000, validade: dias(30) });
    await withTenant(prisma, tenantA.id, (tx) => tx.proposal.update({ where: { id: proposta.id }, data: { status: "ACEITA" } }));
    await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });

    const dash = await obterDashboardExecutivo(prisma, tenantA.id);
    expect(dash.financeiro.margem.amostras).toBe(0);
  });

  it("conta e calcula margem quando Proposal.custos está preenchido", async () => {
    const lead = await criarLead();
    const proposta = await criarProposta(prisma, { tenantId: tenantA.id, leadId: lead.id, moeda: "BRL", preco: 5000, custos: 3000, validade: dias(30) });
    await withTenant(prisma, tenantA.id, (tx) => tx.proposal.update({ where: { id: proposta.id }, data: { status: "ACEITA" } }));
    await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });

    const dash = await obterDashboardExecutivo(prisma, tenantA.id);
    expect(dash.financeiro.margem.amostras).toBe(1);
    expect(dash.financeiro.margem.porMoeda).toEqual([{ moeda: "BRL", valor: 2000 }]);
  });
});

describe("obterDashboardExecutivo — ocupação null sem capacidade pra calcular", () => {
  it("null quando não há grupo operacional ativo", async () => {
    const dash = await obterDashboardExecutivo(prisma, tenantA.id);
    expect(dash.operacao.ocupacaoPercentual).toBeNull();
  });

  it("percentual real quando existe grupo com capacidade e passageiros", async () => {
    const trip = await criarTrip(prisma, { tenantId: tenantA.id, roteiro: "Trip Dashboard", dataInicio: dias(3), dataFim: dias(8), timezone: "Africa/Casablanca", actorType: "HUMANO", userId: userA.id });
    await withTenant(prisma, tenantA.id, (tx) => tx.trip.update({ where: { id: trip.id }, data: { status: "CONFIRMADA" } }));
    const veiculoR = await criarTourVehicle(prisma, { tenantId: tenantA.id, nome: `Van Dash ${Date.now()}`, capacidade: 4, actorType: "HUMANO", userId: userA.id });
    if (!veiculoR.ok) throw new Error("esperava veiculo");
    const grupoR = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Grupo Dash", veiculoId: veiculoR.veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!grupoR.ok) throw new Error("esperava grupo");

    const lead = await criarLead();
    const proposta = await criarProposta(prisma, { tenantId: tenantA.id, leadId: lead.id, moeda: "BRL", preco: 5000, validade: dias(30) });
    await withTenant(prisma, tenantA.id, (tx) => tx.proposal.update({ where: { id: proposta.id }, data: { status: "ACEITA" } }));
    const bookingR = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!bookingR.ok) throw new Error("esperava booking");
    await withTenant(prisma, tenantA.id, (tx) => tx.booking.update({ where: { id: bookingR.booking.id }, data: { tripId: trip.id, tripGroupId: grupoR.grupo.id } }));
    await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: bookingR.booking.id, nome: "Passageiro 1" });
    await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: bookingR.booking.id, nome: "Passageiro 2" });

    const dash = await obterDashboardExecutivo(prisma, tenantA.id);
    expect(dash.operacao.ocupacaoPercentual).toBe(50); // 2 de 4
  });
});
