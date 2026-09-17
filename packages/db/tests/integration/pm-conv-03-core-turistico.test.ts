import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withSystem,
  withTenant,
  criarProposta,
  enviarProposta,
  aceitarProposta,
  criarBookingDaProposta,
  adicionarTraveler,
  editarTraveler,
  criarTrip,
  criarProfessional,
  editarProfessional,
  listarProfessionals,
  criarSupplier,
  listarSuppliers,
  criarTourVehicle,
  editarTourVehicle,
  listarTourVehicles,
  criarTripGroup,
  atribuirProfissional,
  removerProfissional,
  vincularBookingAoGrupo,
  desvincularBookingDoGrupo,
  atualizarProgressoParada,
  buscarGrupo,
  listarGruposDaTrip,
  criarDiaItinerario,
  criarAtividade,
  registrarTravelerCare,
  buscarTravelerCare,
} from "../../src";

/**
 * PM-CONV-03 (Core Turístico Canônico) — Professional/Supplier/TourVehicle/
 * TripGroup/TripActivityProgress/TravelerCare + ampliação de Traveler.
 * Cobre especialmente: conflito de agenda (§17, nunca só confiado na UI),
 * capacidade de veículo, idempotência de atribuição, consentimento
 * obrigatório em TravelerCare, e isolamento multi-tenant de toda entidade
 * nova.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };
let leadA: { id: string };

const VALIDADE_FUTURA = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

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

async function criarTripEntre(tenantId: string, inicio: Date, fim: Date, roteiro = "Trip teste") {
  return criarTrip(prisma, { tenantId, roteiro, dataInicio: inicio, dataFim: fim, timezone: "Africa/Casablanca", actorType: "HUMANO", userId: userA.id });
}

async function criarVeiculoPadrao(tenantId: string, capacidade = 4) {
  const r = await criarTourVehicle(prisma, { tenantId, nome: "Van 1", capacidade, actorType: "HUMANO", userId: userA.id });
  if (!r.ok) throw new Error("esperava criação de veículo");
  return r.veiculo;
}

async function criarProfissionalPadrao(tenantId: string, nome = "Guia 1") {
  return criarProfessional(prisma, { tenantId, nome, actorType: "HUMANO", userId: userA.id });
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (pm-conv-03 teste)", slug: `pmconv03-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (pm-conv-03 teste)", slug: `pmconv03-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `pmconv03-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
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
    await tx.travelerCare.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripActivityProgress.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripGroupProfissional.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.updateMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } }, data: { tripGroupId: null, tripId: null } });
    await tx.tripGroup.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripActivity.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripItineraryDay.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.trip.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tourVehicle.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.professional.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.supplier.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.traveler.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("Professional — cadastro único (pessoa + papéis, não Guide/Driver separados)", () => {
  it("cria, edita e desativa", async () => {
    const p = await criarProfissionalPadrao(tenantA.id, "Ahmed");
    expect(p.ativo).toBe(true);

    const editado = await editarProfessional(prisma, { tenantId: tenantA.id, professionalId: p.id, ativo: false, actorType: "HUMANO", userId: userA.id });
    expect(editado.ok).toBe(true);
    if (editado.ok) expect(editado.profissional.ativo).toBe(false);
  });

  it("Tenant B não lista Professional do Tenant A (RLS)", async () => {
    await criarProfissionalPadrao(tenantA.id);
    const listaB = await listarProfessionals(prisma, tenantB.id);
    expect(listaB).toHaveLength(0);
  });
});

describe("Supplier — cadastro operacional", () => {
  it("cria e lista", async () => {
    await criarSupplier(prisma, { tenantId: tenantA.id, nome: "Riad Marrakech", tipo: "hotel", actorType: "HUMANO", userId: userA.id });
    const lista = await listarSuppliers(prisma, tenantA.id);
    expect(lista).toHaveLength(1);
  });

  it("Tenant B não lista Supplier do Tenant A (RLS)", async () => {
    await criarSupplier(prisma, { tenantId: tenantA.id, nome: "Riad Marrakech", actorType: "HUMANO", userId: userA.id });
    const listaB = await listarSuppliers(prisma, tenantB.id);
    expect(listaB).toHaveLength(0);
  });
});

describe("TourVehicle — exclusivamente recurso de operação turística", () => {
  it("rejeita capacidade inválida", async () => {
    const r = await criarTourVehicle(prisma, { tenantId: tenantA.id, nome: "Van", capacidade: 0, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("CAPACIDADE_INVALIDA");
  });

  it("cria e edita", async () => {
    const v = await criarVeiculoPadrao(tenantA.id, 12);
    const editado = await editarTourVehicle(prisma, { tenantId: tenantA.id, veiculoId: v.id, capacidade: 15, actorType: "HUMANO", userId: userA.id });
    expect(editado.ok).toBe(true);
    if (editado.ok) expect(editado.veiculo.capacidade).toBe(15);
  });

  it("Tenant B não lista TourVehicle do Tenant A (RLS)", async () => {
    await criarVeiculoPadrao(tenantA.id);
    const listaB = await listarTourVehicles(prisma, tenantB.id);
    expect(listaB).toHaveLength(0);
  });
});

describe("TripGroup — conflito de agenda validado no backend (§17), nunca só na UI", () => {
  it("cria grupo com veículo e crew", async () => {
    const trip = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const veiculo = await criarVeiculoPadrao(tenantA.id);
    const g = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van 1", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    expect(g.ok).toBe(true);
  });

  it("rejeita veículo já alocado a outro grupo com datas sobrepostas", async () => {
    const veiculo = await criarVeiculoPadrao(tenantA.id);
    const trip1 = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const trip2 = await criarTripEntre(tenantA.id, dias(15), dias(20)); // sobrepõe trip1 (10-18 vs 15-20)

    const g1 = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip1.id, nome: "Van A", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    expect(g1.ok).toBe(true);

    const g2 = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip2.id, nome: "Van B", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    expect(g2.ok).toBe(false);
    if (!g2.ok) expect(g2.motivo).toBe("CONFLITO_VEICULO");
  });

  it("permite o mesmo veículo em Trips com datas que NÃO se sobrepõem", async () => {
    const veiculo = await criarVeiculoPadrao(tenantA.id);
    const trip1 = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const trip2 = await criarTripEntre(tenantA.id, dias(25), dias(30)); // não sobrepõe

    const g1 = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip1.id, nome: "Van A", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    const g2 = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip2.id, nome: "Van B", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    expect(g1.ok && g2.ok).toBe(true);
  });

  it("rejeita profissional já atribuído a outro grupo com datas sobrepostas", async () => {
    const veiculo1 = await criarVeiculoPadrao(tenantA.id);
    const veiculo2 = await criarVeiculoPadrao(tenantA.id);
    const profissional = await criarProfissionalPadrao(tenantA.id);
    const trip1 = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const trip2 = await criarTripEntre(tenantA.id, dias(15), dias(20));

    const g1 = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip1.id, nome: "Van A", veiculoId: veiculo1.id, actorType: "HUMANO", userId: userA.id });
    const g2 = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip2.id, nome: "Van B", veiculoId: veiculo2.id, actorType: "HUMANO", userId: userA.id });
    if (!g1.ok || !g2.ok) throw new Error("esperava criação dos dois grupos");

    const a1 = await atribuirProfissional(prisma, { tenantId: tenantA.id, tripGroupId: g1.grupo.id, professionalId: profissional.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });
    expect(a1.ok).toBe(true);

    const a2 = await atribuirProfissional(prisma, { tenantId: tenantA.id, tripGroupId: g2.grupo.id, professionalId: profissional.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });
    expect(a2.ok).toBe(false);
    if (!a2.ok) expect(a2.motivo).toBe("CONFLITO_PROFISSIONAL");
  });

  it("uma mesma pessoa pode acumular GUIA + MOTORISTA no MESMO grupo (§10)", async () => {
    const veiculo = await criarVeiculoPadrao(tenantA.id);
    const profissional = await criarProfissionalPadrao(tenantA.id);
    const trip = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const g = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!g.ok) throw new Error("esperava criação do grupo");

    const guia = await atribuirProfissional(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, professionalId: profissional.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });
    const motorista = await atribuirProfissional(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, professionalId: profissional.id, papel: "MOTORISTA", actorType: "HUMANO", userId: userA.id });
    expect(guia.ok && motorista.ok).toBe(true);

    const grupoCompleto = await buscarGrupo(prisma, tenantA.id, g.grupo.id);
    expect(grupoCompleto?.profissionais).toHaveLength(2);
  });

  it("reatribuir o mesmo (grupo, profissional, papel) é idempotente — nunca duplica", async () => {
    const veiculo = await criarVeiculoPadrao(tenantA.id);
    const profissional = await criarProfissionalPadrao(tenantA.id);
    const trip = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const g = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!g.ok) throw new Error("esperava criação do grupo");

    const primeira = await atribuirProfissional(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, professionalId: profissional.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });
    const segunda = await atribuirProfissional(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, professionalId: profissional.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });
    expect(primeira.ok && segunda.ok).toBe(true);
    if (segunda.ok) expect(segunda.jaAtribuido).toBe(true);

    const grupoCompleto = await buscarGrupo(prisma, tenantA.id, g.grupo.id);
    expect(grupoCompleto?.profissionais).toHaveLength(1);
  });

  it("remove atribuição de profissional", async () => {
    const veiculo = await criarVeiculoPadrao(tenantA.id);
    const profissional = await criarProfissionalPadrao(tenantA.id);
    const trip = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const g = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!g.ok) throw new Error("esperava criação do grupo");
    await atribuirProfissional(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, professionalId: profissional.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });

    const removido = await removerProfissional(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, professionalId: profissional.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });
    expect(removido).toBe(true);

    const grupoCompleto = await buscarGrupo(prisma, tenantA.id, g.grupo.id);
    expect(grupoCompleto?.profissionais).toHaveLength(0);
  });

  it("Tenant B não lista TripGroup do Tenant A (RLS)", async () => {
    const trip = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const veiculo = await criarVeiculoPadrao(tenantA.id);
    await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });

    const listaB = await listarGruposDaTrip(prisma, tenantB.id, trip.id);
    expect(listaB).toHaveLength(0);
  });
});

describe("Booking ↔ TripGroup — só dentro da mesma Trip, respeitando capacidade do veículo", () => {
  it("vincula Booking dentro da capacidade", async () => {
    const trip = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const veiculo = await criarVeiculoPadrao(tenantA.id, 4);
    const g = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!g.ok) throw new Error("esperava criação do grupo");

    const booking = await criarBooking(tenantA.id, leadA.id);
    await withTenant(prisma, tenantA.id, (tx) => tx.booking.update({ where: { id: booking.id }, data: { tripId: trip.id } }));
    await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: booking.id, nome: "Passageiro 1" });
    await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: booking.id, nome: "Passageiro 2" });

    const r = await vincularBookingAoGrupo(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, bookingId: booking.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
  });

  it("rejeita quando excede a capacidade do veículo", async () => {
    const trip = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const veiculo = await criarVeiculoPadrao(tenantA.id, 1); // capacidade mínima
    const g = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!g.ok) throw new Error("esperava criação do grupo");

    const booking = await criarBooking(tenantA.id, leadA.id);
    await withTenant(prisma, tenantA.id, (tx) => tx.booking.update({ where: { id: booking.id }, data: { tripId: trip.id } }));
    await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: booking.id, nome: "Passageiro 1" });
    await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: booking.id, nome: "Passageiro 2" }); // 2 > capacidade 1

    const r = await vincularBookingAoGrupo(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, bookingId: booking.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("CAPACIDADE_EXCEDIDA");
  });

  it("rejeita Booking de uma Trip diferente da do grupo", async () => {
    const trip1 = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const trip2 = await criarTripEntre(tenantA.id, dias(25), dias(30));
    const veiculo = await criarVeiculoPadrao(tenantA.id, 4);
    const g = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip1.id, nome: "Van", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!g.ok) throw new Error("esperava criação do grupo");

    const booking = await criarBooking(tenantA.id, leadA.id);
    await withTenant(prisma, tenantA.id, (tx) => tx.booking.update({ where: { id: booking.id }, data: { tripId: trip2.id } }));

    const r = await vincularBookingAoGrupo(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, bookingId: booking.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("TRIP_DIVERGENTE");
  });

  it("desvincula sem apagar o Booking", async () => {
    const trip = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const veiculo = await criarVeiculoPadrao(tenantA.id, 4);
    const g = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!g.ok) throw new Error("esperava criação do grupo");
    const booking = await criarBooking(tenantA.id, leadA.id);
    await withTenant(prisma, tenantA.id, (tx) => tx.booking.update({ where: { id: booking.id }, data: { tripId: trip.id } }));
    await vincularBookingAoGrupo(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, bookingId: booking.id, actorType: "HUMANO", userId: userA.id });

    const desvinculado = await desvincularBookingDoGrupo(prisma, { tenantId: tenantA.id, bookingId: booking.id, actorType: "HUMANO", userId: userA.id });
    expect(desvinculado).toBe(true);
    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.booking.findUniqueOrThrow({ where: { id: booking.id } }));
    expect(releitura.tripGroupId).toBeNull();
  });
});

describe("Progresso de parada — por (Group × Activity), nunca por Activity sozinha", () => {
  it("marcar uma parada ATUAL move a parada ATUAL anterior do MESMO grupo para CONCLUIDA", async () => {
    const trip = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const veiculo = await criarVeiculoPadrao(tenantA.id);
    const g = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van", veiculoId: veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!g.ok) throw new Error("esperava criação do grupo");
    const dia = await criarDiaItinerario(prisma, { tenantId: tenantA.id, tripId: trip.id, numeroDia: 1, data: dias(10) });
    if (!dia.ok) throw new Error("esperava criação do dia");
    const parada1 = await criarAtividade(prisma, { tenantId: tenantA.id, itineraryDayId: dia.dia.id, nome: "Parada 1" });
    const parada2 = await criarAtividade(prisma, { tenantId: tenantA.id, itineraryDayId: dia.dia.id, nome: "Parada 2" });
    if (!parada1.ok || !parada2.ok) throw new Error("esperava criação das paradas");

    await atualizarProgressoParada(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, tripActivityId: parada1.atividade.id, status: "ATUAL", actorType: "HUMANO", userId: userA.id });
    await atualizarProgressoParada(prisma, { tenantId: tenantA.id, tripGroupId: g.grupo.id, tripActivityId: parada2.atividade.id, status: "ATUAL", actorType: "HUMANO", userId: userA.id });

    const grupoCompleto = await buscarGrupo(prisma, tenantA.id, g.grupo.id);
    const p1 = grupoCompleto?.progresso.find((p) => p.tripActivityId === parada1.atividade.id);
    const p2 = grupoCompleto?.progresso.find((p) => p.tripActivityId === parada2.atividade.id);
    expect(p1?.status).toBe("CONCLUIDA");
    expect(p2?.status).toBe("ATUAL");
  });

  it("dois Groups da mesma Trip podem estar em paradas diferentes ao mesmo tempo", async () => {
    const trip = await criarTripEntre(tenantA.id, dias(10), dias(18));
    const veiculo1 = await criarVeiculoPadrao(tenantA.id);
    const veiculo2 = await criarVeiculoPadrao(tenantA.id);
    const g1 = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van A", veiculoId: veiculo1.id, actorType: "HUMANO", userId: userA.id });
    const g2 = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Van B", veiculoId: veiculo2.id, actorType: "HUMANO", userId: userA.id });
    if (!g1.ok || !g2.ok) throw new Error("esperava criação dos grupos");
    const dia = await criarDiaItinerario(prisma, { tenantId: tenantA.id, tripId: trip.id, numeroDia: 1, data: dias(10) });
    if (!dia.ok) throw new Error("esperava criação do dia");
    const parada1 = await criarAtividade(prisma, { tenantId: tenantA.id, itineraryDayId: dia.dia.id, nome: "Parada 1" });
    const parada2 = await criarAtividade(prisma, { tenantId: tenantA.id, itineraryDayId: dia.dia.id, nome: "Parada 2" });
    if (!parada1.ok || !parada2.ok) throw new Error("esperava criação das paradas");

    await atualizarProgressoParada(prisma, { tenantId: tenantA.id, tripGroupId: g1.grupo.id, tripActivityId: parada1.atividade.id, status: "ATUAL", actorType: "HUMANO", userId: userA.id });
    await atualizarProgressoParada(prisma, { tenantId: tenantA.id, tripGroupId: g2.grupo.id, tripActivityId: parada2.atividade.id, status: "ATUAL", actorType: "HUMANO", userId: userA.id });

    const grupo1Completo = await buscarGrupo(prisma, tenantA.id, g1.grupo.id);
    const grupo2Completo = await buscarGrupo(prisma, tenantA.id, g2.grupo.id);
    expect(grupo1Completo?.progresso.find((p) => p.tripActivityId === parada1.atividade.id)?.status).toBe("ATUAL");
    expect(grupo2Completo?.progresso.find((p) => p.tripActivityId === parada2.atividade.id)?.status).toBe("ATUAL");
  });
});

describe("Traveler — ampliação (passaporte/voo/guardião), sem criar Passenger novo", () => {
  it("edita campos de passaporte e audita a alteração", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const t = await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: booking.id, nome: "Passageiro" });
    if (!t.ok) throw new Error("esperava criação do traveler");

    const editado = await editarTraveler(prisma, {
      tenantId: tenantA.id,
      travelerId: t.traveler.id,
      passaporteNumero: "AB123456",
      passaportePaisEmissor: "BR",
      passaporteValidoAte: dias(400),
      guardiaoNome: null,
      actorType: "HUMANO",
      userId: userA.id,
    });
    expect(editado.ok).toBe(true);
    if (editado.ok) expect(editado.traveler.passaporteNumero).toBe("AB123456");

    const evento = await withSystem(prisma, (tx) => tx.auditLog.findFirstOrThrow({ where: { tenantId: tenantA.id, entidadeId: t.traveler.id, acao: "TRAVELER_ATUALIZADO" } }));
    expect(evento.resultado).toBe("ok");
  });
});

describe("TravelerCare — dado sensível, exige consentimento explícito, nunca em listagem ampla", () => {
  it("rejeita gravar informação preenchida sem consentimento", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const t = await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: booking.id, nome: "Passageiro" });
    if (!t.ok) throw new Error("esperava criação do traveler");

    const r = await registrarTravelerCare(prisma, { tenantId: tenantA.id, travelerId: t.traveler.id, dieta: "Vegetariano", consentimento: false, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("CONSENTIMENTO_REQUERIDO");
  });

  it("grava com consentimento e recupera via consulta própria (nunca embutida em listarTravelers)", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const t = await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: booking.id, nome: "Passageiro" });
    if (!t.ok) throw new Error("esperava criação do traveler");

    const r = await registrarTravelerCare(prisma, { tenantId: tenantA.id, travelerId: t.traveler.id, dieta: "Vegetariano", consentimento: true, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);

    const care = await buscarTravelerCare(prisma, tenantA.id, t.traveler.id);
    expect(care?.dieta).toBe("Vegetariano");
  });

  it("Audit nunca grava o conteúdo sensível em si, só o fato da alteração", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const t = await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: booking.id, nome: "Passageiro" });
    if (!t.ok) throw new Error("esperava criação do traveler");
    await registrarTravelerCare(prisma, { tenantId: tenantA.id, travelerId: t.traveler.id, condicoes: "Diabetes tipo 2", consentimento: true, actorType: "HUMANO", userId: userA.id });

    const evento = await withSystem(prisma, (tx) => tx.auditLog.findFirstOrThrow({ where: { tenantId: tenantA.id, acao: "TRAVELER_CARE_REGISTRADO" } }));
    expect(JSON.stringify(evento.detalhe)).not.toContain("Diabetes");
  });

  it("Tenant B não consegue ler TravelerCare do Tenant A (RLS)", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const t = await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: booking.id, nome: "Passageiro" });
    if (!t.ok) throw new Error("esperava criação do traveler");
    await registrarTravelerCare(prisma, { tenantId: tenantA.id, travelerId: t.traveler.id, dieta: "Vegetariano", consentimento: true, actorType: "HUMANO", userId: userA.id });

    const careB = await buscarTravelerCare(prisma, tenantB.id, t.traveler.id);
    expect(careB).toBeNull();
  });
});
