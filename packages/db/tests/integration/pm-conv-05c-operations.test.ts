import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withSystem,
  withTenant,
  criarTrip,
  criarTourVehicle,
  criarTripGroup,
  criarProfessional,
  atribuirProfissional,
  criarProposta,
  criarBookingDaProposta,
  adicionarTraveler,
  emitirCredencial,
  confirmarCheckIn,
  iniciarTracking,
  registrarPing,
  registrarOcorrencia,
  criarDiaItinerario,
  criarAtividade,
  atualizarProgressoParada,
  obterPainelOperacional,
} from "../../src";

/**
 * PM-CONV-05, Track C — Central de Operações. `obterPainelOperacional` só
 * compõe dado já existente (Trip/TripGroup/TravelerCheckIn/TrackingSession)
 * — a suíte cobre filtro de status, contagem real e alertas derivados de
 * dado real (nunca inventados).
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };

const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function montarLead(tenantId: string) {
  return withTenant(prisma, tenantId, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId, nome: `Funil ops ${Date.now()}` } });
    const stage = await tx.stage.create({ data: { tenantId, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId, nome: "Cliente Ops" } });
    return tx.lead.create({ data: { tenantId, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
  });
}

async function montarGrupoCompleto(tenantId: string, opts: { status: "PLANEJAMENTO" | "CONFIRMADA" | "EM_ANDAMENTO"; capacidade?: number; comPassageiro?: boolean }) {
  const trip = await criarTrip(prisma, { tenantId, roteiro: "Trip Ops", dataInicio: dias(3), dataFim: dias(8), timezone: "Africa/Casablanca", actorType: "HUMANO", userId: userA.id });
  await withTenant(prisma, tenantId, (tx) => tx.trip.update({ where: { id: trip.id }, data: { status: opts.status } }));

  const veiculoR = await criarTourVehicle(prisma, { tenantId, nome: `Van Ops ${Date.now()}-${Math.random()}`, capacidade: opts.capacidade ?? 10, actorType: "HUMANO", userId: userA.id });
  if (!veiculoR.ok) throw new Error("esperava criação do veículo");
  const grupoR = await criarTripGroup(prisma, { tenantId, tripId: trip.id, nome: "Grupo Ops", veiculoId: veiculoR.veiculo.id, actorType: "HUMANO", userId: userA.id });
  if (!grupoR.ok) throw new Error("esperava criação do grupo");

  const profissional = await criarProfessional(prisma, { tenantId, nome: `Guia Ops ${Date.now()}`, actorType: "HUMANO", userId: userA.id });
  await atribuirProfissional(prisma, { tenantId, tripGroupId: grupoR.grupo.id, professionalId: profissional.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });

  if (opts.comPassageiro) {
    const lead = await montarLead(tenantId);
    const proposta = await criarProposta(prisma, { tenantId, leadId: lead.id, moeda: "BRL", preco: 5000, validade: dias(30) });
    await withTenant(prisma, tenantId, (tx) => tx.proposal.update({ where: { id: proposta.id }, data: { status: "ACEITA" } }));
    const bookingR = await criarBookingDaProposta(prisma, { tenantId, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!bookingR.ok) throw new Error("esperava criação do booking");
    await withTenant(prisma, tenantId, (tx) => tx.booking.update({ where: { id: bookingR.booking.id }, data: { tripId: trip.id, tripGroupId: grupoR.grupo.id } }));
    const travelerR = await adicionarTraveler(prisma, { tenantId, bookingId: bookingR.booking.id, nome: "Passageiro Ops" });
    if (!travelerR.ok) throw new Error("esperava criação do traveler");
    return { trip, grupo: grupoR.grupo, profissional, traveler: travelerR.traveler };
  }

  return { trip, grupo: grupoR.grupo, profissional, traveler: null };
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (ops teste)", slug: `ops-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (ops teste)", slug: `ops-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `ops-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: role.id } });
  });
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
    await tx.geolocationPing.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.trackingSession.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.travelerCheckIn.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripGroupProfissional.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripGroup.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.professional.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tourVehicle.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.trip.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("obterPainelOperacional — filtro de status", () => {
  it("inclui CONFIRMADA e EM_ANDAMENTO, exclui PLANEJAMENTO", async () => {
    await montarGrupoCompleto(tenantA.id, { status: "PLANEJAMENTO" });
    await montarGrupoCompleto(tenantA.id, { status: "CONFIRMADA" });
    await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO" });

    const painel = await obterPainelOperacional(prisma, tenantA.id);
    expect(painel).toHaveLength(2);
    expect(painel.map((p) => p.statusViagem).sort()).toEqual(["CONFIRMADA", "EM_ANDAMENTO"]);
  });
});

describe("obterPainelOperacional — contagens reais", () => {
  it("conta check-ins/embarques a partir do estado real do TravelerCheckIn", async () => {
    const { grupo, traveler } = await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO", comPassageiro: true });
    const credencial = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler!.id, actorType: "HUMANO", userId: userA.id });
    if (!credencial.ok) throw new Error("esperava emissão da credencial");
    await confirmarCheckIn(prisma, { tenantId: tenantA.id, tokenBruto: credencial.token, actorType: "HUMANO", userId: userA.id });

    const painel = await obterPainelOperacional(prisma, tenantA.id);
    const item = painel.find((p) => p.tripGroupId === grupo.id)!;
    expect(item.totalPassageiros).toBe(1);
    expect(item.checkinsRealizados).toBe(1);
    expect(item.embarcados).toBe(0);
  });
});

describe("obterPainelOperacional — alertas derivados de dado real", () => {
  it("SEM_RASTREAMENTO quando viagem EM_ANDAMENTO sem TrackingSession ativa", async () => {
    const { grupo } = await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO" });
    const painel = await obterPainelOperacional(prisma, tenantA.id);
    const item = painel.find((p) => p.tripGroupId === grupo.id)!;
    expect(item.alertas.some((a) => a.tipo === "SEM_RASTREAMENTO")).toBe(true);
  });

  it("alerta SEM_RASTREAMENTO some quando existe tracking ativo", async () => {
    const { grupo, profissional } = await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO" });
    await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });

    const painel = await obterPainelOperacional(prisma, tenantA.id);
    const item = painel.find((p) => p.tripGroupId === grupo.id)!;
    expect(item.rastreamentoAtivo).toBe(true);
    expect(item.alertas.some((a) => a.tipo === "SEM_RASTREAMENTO")).toBe(false);
  });

  it("CAPACIDADE_LOTADA quando passageiros atingem a capacidade do veículo", async () => {
    const { grupo } = await montarGrupoCompleto(tenantA.id, { status: "CONFIRMADA", capacidade: 1, comPassageiro: true });
    const painel = await obterPainelOperacional(prisma, tenantA.id);
    const item = painel.find((p) => p.tripGroupId === grupo.id)!;
    expect(item.alertas.some((a) => a.tipo === "CAPACIDADE_LOTADA")).toBe(true);
  });
});

describe("obterPainelOperacional — RLS cross-tenant", () => {
  it("Tenant B não vê grupos do Tenant A", async () => {
    await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO" });
    const painelB = await obterPainelOperacional(prisma, tenantB.id);
    expect(painelB).toHaveLength(0);
  });
});

describe("obterPainelOperacional — PM-CONV-06 §Track C: rastreamento desatualizado (não confundir com ausente)", () => {
  it("RASTREAMENTO_DESATUALIZADO quando a sessão está ATIVA mas o último ping é antigo — nunca junto de SEM_RASTREAMENTO", async () => {
    const { grupo, profissional } = await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO" });
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava início de tracking");
    await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.6, longitude: -7.9, capturedAt: new Date(Date.now() - 20 * 60 * 1000) });

    const painel = await obterPainelOperacional(prisma, tenantA.id);
    const item = painel.find((p) => p.tripGroupId === grupo.id)!;
    expect(item.rastreamentoAtivo).toBe(true);
    expect(item.alertas.some((a) => a.tipo === "SEM_RASTREAMENTO")).toBe(false);
    expect(item.alertas.some((a) => a.tipo === "RASTREAMENTO_DESATUALIZADO")).toBe(true);
  });

  it("sem alerta de desatualizado quando o ping é recente", async () => {
    const { grupo, profissional } = await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO" });
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava início de tracking");
    await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.6, longitude: -7.9, capturedAt: new Date() });

    const painel = await obterPainelOperacional(prisma, tenantA.id);
    const item = painel.find((p) => p.tripGroupId === grupo.id)!;
    expect(item.alertas.some((a) => a.tipo === "RASTREAMENTO_DESATUALIZADO")).toBe(false);
    expect(item.ultimaAtualizacaoRastreamento).not.toBeNull();
  });
});

describe("obterPainelOperacional — PM-CONV-06 §Track C: ocorrências visíveis na Central (lacuna declarada no PM-CONV-05)", () => {
  it("mostra as ocorrências recentes do grupo (mesma fonte de verdade do check-in de campo, sem duplicar TripIncident)", async () => {
    const { grupo, profissional } = await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO" });
    await registrarOcorrencia(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, severidade: "BAIXA", descricao: "Atraso pequeno no ponto de encontro", actorType: "HUMANO", userId: userA.id });

    const painel = await obterPainelOperacional(prisma, tenantA.id);
    const item = painel.find((p) => p.tripGroupId === grupo.id)!;
    expect(item.ocorrenciasRecentes).toHaveLength(1);
    expect(item.ocorrenciasRecentes[0]!.descricao).toBe("Atraso pequeno no ponto de encontro");
    expect(item.alertas.some((a) => a.tipo === "OCORRENCIA_GRAVE")).toBe(false);
  });

  it("OCORRENCIA_GRAVE quando existe ocorrência de severidade ALTA", async () => {
    const { grupo, profissional } = await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO" });
    await registrarOcorrencia(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, severidade: "ALTA", descricao: "Van com pneu furado na estrada", actorType: "HUMANO", userId: userA.id });

    const painel = await obterPainelOperacional(prisma, tenantA.id);
    const item = painel.find((p) => p.tripGroupId === grupo.id)!;
    expect(item.alertas.some((a) => a.tipo === "OCORRENCIA_GRAVE")).toBe(true);
  });

  it("Tenant B não vê ocorrências do Tenant A (RLS)", async () => {
    const { grupo, profissional } = await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO" });
    await registrarOcorrencia(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, severidade: "ALTA", descricao: "Ocorrência do Tenant A", actorType: "HUMANO", userId: userA.id });

    const painelB = await obterPainelOperacional(prisma, tenantB.id);
    expect(painelB).toHaveLength(0);
  });
});

describe("obterPainelOperacional — PM-CONV-06 §Track C: parada atual/próxima (nunca ETA fabricada)", () => {
  it("deriva parada atual e próxima a partir de TripActivityProgress real, sem parada nenhuma quando nada foi marcado", async () => {
    const { trip, grupo } = await montarGrupoCompleto(tenantA.id, { status: "EM_ANDAMENTO" });
    const diaR = await criarDiaItinerario(prisma, { tenantId: tenantA.id, tripId: trip.id, numeroDia: 1, data: dias(3) });
    if (!diaR.ok) throw new Error("esperava criação do dia");
    const at1 = await criarAtividade(prisma, { tenantId: tenantA.id, itineraryDayId: diaR.dia.id, nome: "Chegada ao riad" });
    const at2 = await criarAtividade(prisma, { tenantId: tenantA.id, itineraryDayId: diaR.dia.id, nome: "Passeio pela medina" });
    if (!at1.ok || !at2.ok) throw new Error("esperava criação das atividades");

    const semNada = await obterPainelOperacional(prisma, tenantA.id);
    const itemSemNada = semNada.find((p) => p.tripGroupId === grupo.id)!;
    expect(itemSemNada.paradaAtual).toBeNull();
    expect(itemSemNada.proximaParada?.nome).toBe("Chegada ao riad"); // primeira PLANEJADA, sem ETA nenhuma — só o nome/local reais

    await atualizarProgressoParada(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, tripActivityId: at1.atividade.id, status: "ATUAL", actorType: "HUMANO", userId: userA.id });

    const painel = await obterPainelOperacional(prisma, tenantA.id);
    const item = painel.find((p) => p.tripGroupId === grupo.id)!;
    expect(item.paradaAtual?.nome).toBe("Chegada ao riad");
    expect(item.proximaParada?.nome).toBe("Passeio pela medina");
  });
});
