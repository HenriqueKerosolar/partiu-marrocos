import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withSystem,
  withTenant,
  criarProposta,
  enviarProposta,
  aceitarProposta,
  criarBookingDaProposta,
  criarTrip,
  moverStatusTrip,
  vincularBookingATrip,
  desvincularBookingDaTrip,
  criarDiaItinerario,
  criarAtividade,
  listarItinerario,
  criarItemChecklist,
  alternarItemChecklist,
  listarChecklist,
  listarTripsDoTenant,
  buscarTrip,
} from "../../src";

/**
 * Trip Operation Foundation 01 (PM-NIGHT-RUN-02, Etapa 5). Prova real da
 * relação 1:N (nunca 1:1 presumida): duas Proposals/Bookings diferentes
 * do mesmo lead são vinculados à MESMA Trip sem conflito.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };
let leadA: { id: string };

const VALIDADE_FUTURA = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const DATA_INICIO = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const DATA_FIM = () => new Date(Date.now() + 38 * 24 * 60 * 60 * 1000);

async function criarLeadPara(tenantId: string, sufixo: string) {
  return withTenant(prisma, tenantId, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId, nome: `Funil ${sufixo}` } });
    const stage = await tx.stage.create({ data: { tenantId, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId, nome: `Cliente ${sufixo}` } });
    return tx.lead.create({ data: { tenantId, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
  });
}

async function criarBooking(tenantId: string, leadId: string) {
  const p = await criarProposta(prisma, { tenantId, leadId, moeda: "BRL", preco: 5000, validade: VALIDADE_FUTURA() });
  await enviarProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  await aceitarProposta(prisma, { tenantId, propostaId: p.id });
  const b = await criarBookingDaProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  if (!b.ok) throw new Error("esperava criação de booking");
  return b.booking;
}

async function criarTripPadrao(tenantId: string) {
  return criarTrip(prisma, { tenantId, roteiro: "Marraquexe + Deserto, 8 dias", dataInicio: DATA_INICIO(), dataFim: DATA_FIM(), timezone: "Africa/Casablanca", actorType: "HUMANO", userId: userA.id });
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (trip teste)", slug: `trip-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (trip teste)", slug: `trip-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `trip-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
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
    await tx.tripChecklistItem.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripActivity.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripItineraryDay.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.updateMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } }, data: { tripId: null } });
    await tx.trip.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("Trip — criação e máquina de estados aplicada de verdade", () => {
  it("cria em PLANEJAMENTO", async () => {
    const trip = await criarTripPadrao(tenantA.id);
    expect(trip.status).toBe("PLANEJAMENTO");
    expect(trip.roteiro).toBe("Marraquexe + Deserto, 8 dias");
  });

  it("transição válida é aplicada e auditada", async () => {
    const trip = await criarTripPadrao(tenantA.id);
    const r = await moverStatusTrip(prisma, { tenantId: tenantA.id, tripId: trip.id, novoStatus: "CONFIRMADA", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.trip.status).toBe("CONFIRMADA");

    const evento = await withSystem(prisma, (tx) => tx.auditLog.findFirstOrThrow({ where: { tenantId: tenantA.id, entidadeId: trip.id, acao: "TRIP_STATUS_ALTERADO" } }));
    expect(evento.resultado).toBe("ok");
  });

  it("transição inválida é rejeitada", async () => {
    const trip = await criarTripPadrao(tenantA.id);
    const r = await moverStatusTrip(prisma, { tenantId: tenantA.id, tripId: trip.id, novoStatus: "EM_ANDAMENTO", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("TRANSICAO_INVALIDA");
  });
});

describe("Trip ↔ Booking — relação 1:N real, nunca presumida 1:1", () => {
  it("dois Bookings diferentes do mesmo lead são vinculados à MESMA Trip sem conflito", async () => {
    const trip = await criarTripPadrao(tenantA.id);
    const booking1 = await criarBooking(tenantA.id, leadA.id);
    const booking2 = await criarBooking(tenantA.id, leadA.id);

    const r1 = await vincularBookingATrip(prisma, { tenantId: tenantA.id, bookingId: booking1.id, tripId: trip.id, actorType: "HUMANO", userId: userA.id });
    const r2 = await vincularBookingATrip(prisma, { tenantId: tenantA.id, bookingId: booking2.id, tripId: trip.id, actorType: "HUMANO", userId: userA.id });
    expect(r1.ok && r2.ok).toBe(true);

    const tripCompleta = await buscarTrip(prisma, tenantA.id, trip.id);
    expect(tripCompleta?.bookings).toHaveLength(2);
  });

  it("desvincular remove a associação sem apagar o Booking", async () => {
    const trip = await criarTripPadrao(tenantA.id);
    const booking = await criarBooking(tenantA.id, leadA.id);
    await vincularBookingATrip(prisma, { tenantId: tenantA.id, bookingId: booking.id, tripId: trip.id, actorType: "HUMANO", userId: userA.id });

    const desvinculado = await desvincularBookingDaTrip(prisma, { tenantId: tenantA.id, bookingId: booking.id, actorType: "HUMANO", userId: userA.id });
    expect(desvinculado).toBe(true);

    const bookingReleitura = await withTenant(prisma, tenantA.id, (tx) => tx.booking.findUniqueOrThrow({ where: { id: booking.id } }));
    expect(bookingReleitura.tripId).toBeNull(); // booking continua existindo, só sem vínculo
  });

  it("Booking pode existir sem nenhuma Trip associada (não é obrigatório)", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    expect(booking.tripId).toBeNull();
  });
});

describe("Itinerário — dias e atividades", () => {
  it("cria dias numerados sem colisão, cada um com suas atividades", async () => {
    const trip = await criarTripPadrao(tenantA.id);
    const dia1 = await criarDiaItinerario(prisma, { tenantId: tenantA.id, tripId: trip.id, numeroDia: 1, data: DATA_INICIO(), titulo: "Chegada" });
    expect(dia1.ok).toBe(true);
    if (!dia1.ok) return;

    await criarAtividade(prisma, { tenantId: tenantA.id, itineraryDayId: dia1.dia.id, nome: "Check-in no riad", horaInicio: "15:00", visivelParaViajante: true });
    await criarAtividade(prisma, { tenantId: tenantA.id, itineraryDayId: dia1.dia.id, nome: "Briefing operacional", horaInicio: "16:00", visivelParaViajante: false, instrucoes: "Confirmar guia local" });

    const itinerario = await listarItinerario(prisma, tenantA.id, trip.id);
    expect(itinerario).toHaveLength(1);
    expect(itinerario[0]!.atividades).toHaveLength(2);
  });

  it("não permite dois dias com o mesmo número na mesma Trip", async () => {
    const trip = await criarTripPadrao(tenantA.id);
    await criarDiaItinerario(prisma, { tenantId: tenantA.id, tripId: trip.id, numeroDia: 1, data: DATA_INICIO() });
    const duplicado = await criarDiaItinerario(prisma, { tenantId: tenantA.id, tripId: trip.id, numeroDia: 1, data: DATA_INICIO() });
    expect(duplicado.ok).toBe(false);
    if (!duplicado.ok) expect(duplicado.motivo).toBe("DIA_JA_EXISTE");
  });

  it("atividade com visivelParaViajante=false continua acessível internamente (só a UI da Traveler Area, Etapa 6, filtraria)", async () => {
    const trip = await criarTripPadrao(tenantA.id);
    const dia = await criarDiaItinerario(prisma, { tenantId: tenantA.id, tripId: trip.id, numeroDia: 1, data: DATA_INICIO() });
    if (!dia.ok) throw new Error("esperava criação");
    const atividade = await criarAtividade(prisma, { tenantId: tenantA.id, itineraryDayId: dia.dia.id, nome: "Reunião com fornecedor", visivelParaViajante: false });
    expect(atividade.ok).toBe(true);
    if (atividade.ok) expect(atividade.atividade.visivelParaViajante).toBe(false);
  });
});

describe("Checklist operacional", () => {
  it("cria itens por categoria e alterna concluído", async () => {
    const trip = await criarTripPadrao(tenantA.id);
    const item = await criarItemChecklist(prisma, { tenantId: tenantA.id, tripId: trip.id, categoria: "TRANSPORTE", titulo: "Confirmar transfer aeroporto-riad" });
    expect(item.ok).toBe(true);
    if (!item.ok) return;

    const alternado = await alternarItemChecklist(prisma, { tenantId: tenantA.id, itemId: item.item.id, concluido: true });
    expect(alternado).toBe(true);

    const checklist = await listarChecklist(prisma, tenantA.id, trip.id);
    expect(checklist).toHaveLength(1);
    expect(checklist[0]!.concluido).toBe(true);
  });
});

describe("Trip — isolamento multi-tenant (RLS)", () => {
  it("Tenant B não lista Trip do Tenant A", async () => {
    await criarTripPadrao(tenantA.id);
    const listagemB = await listarTripsDoTenant(prisma, tenantB.id);
    expect(listagemB).toHaveLength(0);
  });

  it("Tenant B não consegue vincular Booking a uma Trip do Tenant A (FK composta protege)", async () => {
    const trip = await criarTripPadrao(tenantA.id);
    const booking = await criarBooking(tenantA.id, leadA.id);
    const r = await vincularBookingATrip(prisma, { tenantId: tenantB.id, bookingId: booking.id, tripId: trip.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false); // nem o Booking nem a Trip de A são visíveis sob RLS do tenant B
  });
});
