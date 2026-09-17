import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withSystem,
  withTenant,
  criarTrip,
  criarDiaItinerario,
  criarAtividade,
  criarTourVehicle,
  criarTripGroup,
  atribuirProfissional,
  vincularBookingAoGrupo,
  criarProfessional,
  criarProposta,
  enviarProposta,
  aceitarProposta,
  criarBookingDaProposta,
  adicionarTraveler,
  emitirCredencial,
  confirmarCheckIn,
  confirmarEmbarque,
  atualizarProgressoParada,
  iniciarTracking,
  registrarPing,
  registrarOcorrencia,
  obterContextoPassageiro,
  obterPainelOperacional,
  obterDashboardExecutivo,
} from "../../src";

/**
 * PM-CONV-06, Track F — jornada ponta a ponta real, através do MESMO
 * código de produção usado por cada Track isoladamente (Lead → Proposta →
 * Booking → Traveler → Grupo/GPS → Credencial → Check-in → Embarque →
 * Ocorrência → Dashboard/Central de Operações/Área do passageiro), tudo
 * dentro de um tenant isolado criado só para este teste (nunca dado de
 * produção) e limpo no `afterAll`. Não é um novo caminho de código — é a
 * prova de que os pedaços testados isoladamente em cada Track também
 * funcionam encadeados, com o dado de UM passo alimentando o próximo de
 * verdade (nunca um mock do passo anterior).
 */
let tenant: { id: string };
let userA: { id: string };

const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (E2E PM-CONV-06)", slug: `e2e-f-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `e2e-f-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenant.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenant.id, roleId: role.id } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenant.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.geolocationPing.deleteMany({ where: { tenantId: tenant.id } });
    await tx.trackingSession.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tripIncident.deleteMany({ where: { tenantId: tenant.id } });
    await tx.travelerCheckIn.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tripActivityProgress.deleteMany({ where: { tenantId: tenant.id } });
    await tx.booking.deleteMany({ where: { tenantId: tenant.id } });
    await tx.proposal.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tripActivity.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tripItineraryDay.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tripGroupProfissional.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tripGroup.deleteMany({ where: { tenantId: tenant.id } });
    await tx.professional.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tourVehicle.deleteMany({ where: { tenantId: tenant.id } });
    await tx.trip.deleteMany({ where: { tenantId: tenant.id } });
    await tx.lead.deleteMany({ where: { tenantId: tenant.id } });
    await tx.contact.deleteMany({ where: { tenantId: tenant.id } });
    await tx.stage.deleteMany({ where: { tenantId: tenant.id } });
    await tx.pipeline.deleteMany({ where: { tenantId: tenant.id } });
  });
});

describe("PM-CONV-06, Track F — jornada Lead → Booking → Grupo/GPS → Check-in → Embarque → Ocorrência → Dashboard/Central/Passageiro", () => {
  it("cada etapa alimenta a próxima com dado real; painéis e área do passageiro refletem o estado final corretamente", async () => {
    // 1) Lead — funil real (pipeline isDefault, exigido pelo Dashboard pra montar o funil)
    const pipeline = await withTenant(prisma, tenant.id, (tx) => tx.pipeline.create({ data: { tenantId: tenant.id, nome: "Funil E2E", isDefault: true } }));
    const stageNovo = await withTenant(prisma, tenant.id, (tx) => tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Novo lead", ordem: 0 } }));
    const stageFechado = await withTenant(prisma, tenant.id, (tx) => tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Fechado", ordem: 1, isWon: true } }));
    const contact = await withTenant(prisma, tenant.id, (tx) => tx.contact.create({ data: { tenantId: tenant.id, nome: "Cliente Jornada E2E", telefone: "5521988887777" } }));
    const lead = await withTenant(prisma, tenant.id, (tx) => tx.lead.create({ data: { tenantId: tenant.id, contactId: contact.id, pipelineId: pipeline.id, stageId: stageNovo.id } }));

    // 2) Proposta → aceita → Booking real
    const proposta = await criarProposta(prisma, { tenantId: tenant.id, leadId: lead.id, moeda: "BRL", preco: 8000, validade: dias(30) });
    await enviarProposta(prisma, { tenantId: tenant.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    await aceitarProposta(prisma, { tenantId: tenant.id, propostaId: proposta.id });
    await withTenant(prisma, tenant.id, (tx) => tx.lead.update({ where: { id: lead.id }, data: { stageId: stageFechado.id } }));
    const bookingR = await criarBookingDaProposta(prisma, { tenantId: tenant.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!bookingR.ok) throw new Error("esperava criação do booking");
    const travelerR = await adicionarTraveler(prisma, { tenantId: tenant.id, bookingId: bookingR.booking.id, nome: "Passageiro Jornada E2E" });
    if (!travelerR.ok) throw new Error("esperava criação do traveler");

    // 3) Trip + roteiro + grupo operacional + crew — vincula o booking, marca EM_ANDAMENTO
    const trip = await criarTrip(prisma, { tenantId: tenant.id, roteiro: "Roteiro Jornada E2E", dataInicio: dias(1), dataFim: dias(6), timezone: "Africa/Casablanca", actorType: "HUMANO", userId: userA.id });
    await withTenant(prisma, tenant.id, (tx) => tx.trip.update({ where: { id: trip.id }, data: { status: "EM_ANDAMENTO" } }));
    const diaR = await criarDiaItinerario(prisma, { tenantId: tenant.id, tripId: trip.id, numeroDia: 1, data: dias(1) });
    if (!diaR.ok) throw new Error("esperava criação do dia");
    const paradaR = await criarAtividade(prisma, { tenantId: tenant.id, itineraryDayId: diaR.dia.id, nome: "Chegada ao riad", local: "Marrakech" });
    if (!paradaR.ok) throw new Error("esperava criação da atividade");

    const veiculoR = await criarTourVehicle(prisma, { tenantId: tenant.id, nome: "Van Jornada E2E", capacidade: 10, actorType: "HUMANO", userId: userA.id });
    if (!veiculoR.ok) throw new Error("esperava veículo");
    const grupoR = await criarTripGroup(prisma, { tenantId: tenant.id, tripId: trip.id, nome: "Grupo Jornada E2E", veiculoId: veiculoR.veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!grupoR.ok) throw new Error("esperava grupo");
    await withTenant(prisma, tenant.id, (tx) => tx.booking.update({ where: { id: bookingR.booking.id }, data: { tripId: trip.id } }));
    await vincularBookingAoGrupo(prisma, { tenantId: tenant.id, tripGroupId: grupoR.grupo.id, bookingId: bookingR.booking.id, actorType: "HUMANO", userId: userA.id });

    const guia = await criarProfessional(prisma, { tenantId: tenant.id, nome: "Guia Jornada E2E", telefone: "+212611112222", actorType: "HUMANO", userId: userA.id });
    await atribuirProfissional(prisma, { tenantId: tenant.id, tripGroupId: grupoR.grupo.id, professionalId: guia.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });

    // 4) Credencial + Check-in + Embarque (mesma credencial opaca reaproveitada pela área do passageiro)
    const credencial = await emitirCredencial(prisma, { tenantId: tenant.id, tripGroupId: grupoR.grupo.id, travelerId: travelerR.traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!credencial.ok) throw new Error("esperava credencial");
    await confirmarCheckIn(prisma, { tenantId: tenant.id, tokenBruto: credencial.token, actorType: "HUMANO", userId: userA.id });
    await confirmarEmbarque(prisma, { tenantId: tenant.id, tokenBruto: credencial.token, actorType: "HUMANO", userId: userA.id });

    // 5) Progresso de parada — mesma fonte que a Central de Operações E a área do passageiro derivam "parada atual"
    await atualizarProgressoParada(prisma, { tenantId: tenant.id, tripGroupId: grupoR.grupo.id, tripActivityId: paradaR.atividade.id, status: "ATUAL", actorType: "HUMANO", userId: userA.id });

    // 6) GPS — início de rastreamento + ping real
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenant.id, tripGroupId: grupoR.grupo.id, professionalId: guia.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava início de tracking");
    await registrarPing(prisma, { tenantId: tenant.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.63, longitude: -7.99, capturedAt: new Date() });

    // 7) Ocorrência de campo (severidade ALTA — deve virar alerta na Central)
    await registrarOcorrencia(prisma, { tenantId: tenant.id, tripGroupId: grupoR.grupo.id, professionalId: guia.id, severidade: "ALTA", descricao: "Atraso na saída por trânsito", actorType: "HUMANO", userId: userA.id });

    // --- Verificação: cada painel reflete o estado real acumulado acima ---

    const painel = await obterPainelOperacional(prisma, tenant.id);
    const itemPainel = painel.find((p) => p.tripGroupId === grupoR.grupo.id);
    expect(itemPainel).toBeDefined();
    expect(itemPainel!.totalPassageiros).toBe(1);
    expect(itemPainel!.checkinsRealizados).toBe(1);
    expect(itemPainel!.embarcados).toBe(1);
    expect(itemPainel!.rastreamentoAtivo).toBe(true);
    expect(itemPainel!.paradaAtual?.nome).toBe("Chegada ao riad");
    expect(itemPainel!.ocorrenciasRecentes).toHaveLength(1);
    expect(itemPainel!.alertas.some((a) => a.tipo === "OCORRENCIA_GRAVE")).toBe(true);
    expect(itemPainel!.alertas.some((a) => a.tipo === "SEM_RASTREAMENTO")).toBe(false);

    const dashboard = await obterDashboardExecutivo(prisma, tenant.id);
    expect(dashboard.funil.find((f) => f.etapa === "Fechado")?.leads).toBe(1);
    expect(dashboard.bookings.total).toBe(1);
    expect(dashboard.bookings.passageiros).toBe(1);
    expect(dashboard.operacao.embarcados).toBe(1);

    const contextoPassageiro = await obterContextoPassageiro(prisma, credencial.token);
    expect(contextoPassageiro.ok).toBe(true);
    if (contextoPassageiro.ok) {
      expect(contextoPassageiro.contexto.travelerNome).toBe("Passageiro Jornada E2E");
      expect(contextoPassageiro.contexto.statusCheckIn).toBe("EMBARCADO");
      expect(contextoPassageiro.contexto.paradaAtual?.nome).toBe("Chegada ao riad");
      // nunca vaza dado interno/comercial da proposta (preço/comissão) nem qualquer id técnico
      const bruto = JSON.stringify(contextoPassageiro.contexto);
      expect(bruto).not.toContain("8000");
      expect(bruto).not.toContain(bookingR.booking.id);
      expect(bruto).not.toContain(lead.id);
    }
  });
});
