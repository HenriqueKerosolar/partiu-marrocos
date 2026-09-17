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
  revogarCredencial,
  obterContextoPassageiro,
  registrarTravelerCare,
  atualizarProgressoParada,
} from "../../src";

/**
 * PM-CONV-05, Track B — área do passageiro (`obterContextoPassageiro`),
 * token-gated, sem login. Cobre: escopo estrito ao próprio passageiro/
 * grupo, instrucoes/atividade oculta nunca vazadas, token inválido/
 * expirado/revogado rejeitado, sem vazar em qual tenant o token existe.
 */
let tenantA: { id: string };
let userA: { id: string };

const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function montarLead(tenantId: string) {
  return withTenant(prisma, tenantId, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId, nome: `Funil passageiro ${Date.now()}` } });
    const stage = await tx.stage.create({ data: { tenantId, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId, nome: "Cliente Passageiro" } });
    return tx.lead.create({ data: { tenantId, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
  });
}

async function montarGrupoComPassageiro(tenantId: string) {
  const lead = await montarLead(tenantId);
  const trip = await criarTrip(prisma, { tenantId, roteiro: "Roteiro Passageiro", dataInicio: dias(5), dataFim: dias(10), timezone: "Africa/Casablanca", actorType: "HUMANO", userId: userA.id });
  const dia = await withTenant(prisma, tenantId, (tx) => tx.tripItineraryDay.create({ data: { tenantId, tripId: trip.id, numeroDia: 1, data: dias(5), titulo: "Chegada" } }));
  const atividadeVisivel = await withTenant(prisma, tenantId, (tx) =>
    tx.tripActivity.create({ data: { tenantId, itineraryDayId: dia.id, nome: "Passeio no souk", local: "Marrakech", instrucoes: "Guia leva contrato assinado", visivelParaViajante: true } }),
  );
  const atividadeInterna = await withTenant(prisma, tenantId, (tx) =>
    tx.tripActivity.create({ data: { tenantId, itineraryDayId: dia.id, nome: "Reunião interna da equipe", instrucoes: "Confirmar pagamento do fornecedor", visivelParaViajante: false } }),
  );

  const veiculoR = await criarTourVehicle(prisma, { tenantId, nome: `Van Passageiro ${Date.now()}`, capacidade: 10, actorType: "HUMANO", userId: userA.id });
  if (!veiculoR.ok) throw new Error("esperava veiculo");
  const grupoR = await criarTripGroup(prisma, { tenantId, tripId: trip.id, nome: "Grupo Passageiro", veiculoId: veiculoR.veiculo.id, actorType: "HUMANO", userId: userA.id });
  if (!grupoR.ok) throw new Error("esperava grupo");
  const profissional = await criarProfessional(prisma, { tenantId, nome: "Guia Passageiro Teste", telefone: "+212600000000", actorType: "HUMANO", userId: userA.id });
  await atribuirProfissional(prisma, { tenantId, tripGroupId: grupoR.grupo.id, professionalId: profissional.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });

  const proposta = await criarProposta(prisma, { tenantId, leadId: lead.id, moeda: "BRL", preco: 5000, validade: dias(30) });
  await withTenant(prisma, tenantId, (tx) => tx.proposal.update({ where: { id: proposta.id }, data: { status: "ACEITA" } }));
  const bookingR = await criarBookingDaProposta(prisma, { tenantId, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
  if (!bookingR.ok) throw new Error("esperava booking");
  await withTenant(prisma, tenantId, (tx) => tx.booking.update({ where: { id: bookingR.booking.id }, data: { tripId: trip.id, tripGroupId: grupoR.grupo.id } }));
  const travelerR = await adicionarTraveler(prisma, { tenantId, bookingId: bookingR.booking.id, nome: "Passageiro Final" });
  if (!travelerR.ok) throw new Error("esperava traveler");

  return { trip, grupo: grupoR.grupo, traveler: travelerR.traveler, atividadeVisivel, atividadeInterna };
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (passageiro teste)", slug: `passageiro-a-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `passageiro-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: role.id } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantA.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.travelerCheckIn.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.booking.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.proposal.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tripActivity.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tripItineraryDay.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tripGroupProfissional.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tripGroup.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.professional.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tourVehicle.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.trip.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.lead.deleteMany({ where: { tenantId: tenantA.id } });
  });
});

describe("obterContextoPassageiro — acesso via credencial, sem login", () => {
  it("devolve dado real e escopado ao próprio passageiro/grupo", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id);
    const credencial = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!credencial.ok) throw new Error("esperava credencial");

    const r = await obterContextoPassageiro(prisma, credencial.token);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contexto.travelerNome).toBe("Passageiro Final");
    expect(r.contexto.roteiro).toBe("Roteiro Passageiro");
    expect(r.contexto.crew).toEqual([{ nome: "Guia Passageiro Teste", papel: "GUIA", telefone: "+212600000000" }]);
  });

  it("nunca inclui atividade com visivelParaViajante=false, nem o campo instrucoes", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id);
    const credencial = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!credencial.ok) throw new Error("esperava credencial");

    const r = await obterContextoPassageiro(prisma, credencial.token);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const atividades = r.contexto.itinerario.flatMap((d) => d.atividades);
    expect(atividades).toHaveLength(1);
    expect(atividades[0]!.nome).toBe("Passeio no souk");
    expect(JSON.stringify(r.contexto)).not.toContain("Confirmar pagamento do fornecedor");
    expect(JSON.stringify(r.contexto)).not.toContain("Reunião interna");
  });

  it("rejeita token revogado", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id);
    const credencial = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!credencial.ok) throw new Error("esperava credencial");
    await revogarCredencial(prisma, { tenantId: tenantA.id, travelerCheckInId: credencial.travelerCheckInId, actorType: "HUMANO", userId: userA.id });

    const r = await obterContextoPassageiro(prisma, credencial.token);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("REVOGADA");
  });

  it("rejeita token inexistente sem vazar detalhe (mesmo formato de erro de token malformado)", async () => {
    const r = await obterContextoPassageiro(prisma, "a".repeat(48));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("NAO_ENCONTRADA");
  });

  it("rejeita payload malformado antes de qualquer lookup", async () => {
    const r = await obterContextoPassageiro(prisma, "<script>alert(1)</script>");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("FORMATO_INVALIDO");
  });
});

describe("obterContextoPassageiro — PM-CONV-06 §Track A: negativo/segurança adicional", () => {
  it("nunca vaza TravelerCare (dieta/condições/medicamentos) mesmo quando o registro existe para o mesmo traveler", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id);
    const careR = await registrarTravelerCare(prisma, {
      tenantId: tenantA.id,
      travelerId: traveler.id,
      condicoes: "Alergia grave a amendoim — não expor em nenhuma tela pública",
      consentimento: true,
      actorType: "HUMANO",
      userId: userA.id,
    });
    if (!careR.ok) throw new Error("esperava registro de TravelerCare");
    const credencial = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!credencial.ok) throw new Error("esperava credencial");

    const r = await obterContextoPassageiro(prisma, credencial.token);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.contexto)).not.toContain("amendoim");
    expect(JSON.stringify(r.contexto)).not.toContain("Alergia");
  });

  it("IDOR: o token de UM passageiro nunca devolve o traveler/grupo de OUTRO — cada credencial só abre a própria", async () => {
    const grupoUm = await montarGrupoComPassageiro(tenantA.id);
    const credencialUm = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupoUm.grupo.id, travelerId: grupoUm.traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!credencialUm.ok) throw new Error("esperava credencial 1");

    const grupoDois = await montarGrupoComPassageiro(tenantA.id);
    const credencialDois = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupoDois.grupo.id, travelerId: grupoDois.traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!credencialDois.ok) throw new Error("esperava credencial 2");

    expect(credencialUm.token).not.toBe(credencialDois.token);
    const r1 = await obterContextoPassageiro(prisma, credencialUm.token);
    const r2 = await obterContextoPassageiro(prisma, credencialDois.token);
    if (!r1.ok || !r2.ok) throw new Error("esperava sucesso nos dois");
    expect(r1.contexto.grupoNome).toBe(grupoUm.grupo.nome);
    expect(r2.contexto.grupoNome).toBe(grupoDois.grupo.nome);
  });

  it("parada atual/próxima seguem a mesma regra de visibilidade — nunca uma atividade interna aparece como parada", async () => {
    const { grupo, traveler, atividadeInterna } = await montarGrupoComPassageiro(tenantA.id);
    await atualizarProgressoParada(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, tripActivityId: atividadeInterna.id, status: "ATUAL", actorType: "HUMANO", userId: userA.id });
    const credencial = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!credencial.ok) throw new Error("esperava credencial");

    const r = await obterContextoPassageiro(prisma, credencial.token);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // a atividade ATUAL é a interna (não visível) — nunca deve aparecer como paradaAtual pro passageiro
    expect(r.contexto.paradaAtual).toBeNull();
  });

  it("parada atual/próxima devolve dado real quando a atividade ATUAL é visível ao viajante", async () => {
    const { grupo, traveler, atividadeVisivel } = await montarGrupoComPassageiro(tenantA.id);
    await atualizarProgressoParada(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, tripActivityId: atividadeVisivel.id, status: "ATUAL", actorType: "HUMANO", userId: userA.id });
    const credencial = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!credencial.ok) throw new Error("esperava credencial");

    const r = await obterContextoPassageiro(prisma, credencial.token);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contexto.paradaAtual?.nome).toBe("Passeio no souk");
  });
});
