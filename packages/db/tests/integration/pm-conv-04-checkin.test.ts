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
  criarTrip,
  criarTourVehicle,
  criarTripGroup,
  emitirCredencial,
  revogarCredencial,
  validarCredencial,
  confirmarCheckIn,
  confirmarEmbarque,
  marcarNoShow,
} from "../../src";

/**
 * PM-CONV-04, Track A — QR + Check-in + Boarding. Suíte de segurança
 * obrigatória (§18A do comando): token válido/inválido/expirado/revogado/
 * de outro tenant, replay, duplo check-in/boarding, capacidade,
 * cross-tenant, payload malformado/excessivo/malicioso.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };
let leadA: { id: string };

const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function criarLeadPara(tenantId: string, sufixo: string) {
  return withTenant(prisma, tenantId, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId, nome: `Funil ${sufixo}` } });
    const stage = await tx.stage.create({ data: { tenantId, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId, nome: `Cliente ${sufixo}` } });
    return tx.lead.create({ data: { tenantId, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
  });
}

async function montarGrupoComPassageiro(tenantId: string, leadId: string, capacidade = 4) {
  const trip = await criarTrip(prisma, { tenantId, roteiro: "Trip check-in", dataInicio: dias(10), dataFim: dias(18), timezone: "Africa/Casablanca", actorType: "HUMANO", userId: userA.id });
  const veiculoR = await criarTourVehicle(prisma, { tenantId, nome: "Van checkin", capacidade, actorType: "HUMANO", userId: userA.id });
  if (!veiculoR.ok) throw new Error("esperava criação do veículo");
  const grupoR = await criarTripGroup(prisma, { tenantId, tripId: trip.id, nome: "Grupo checkin", veiculoId: veiculoR.veiculo.id, actorType: "HUMANO", userId: userA.id });
  if (!grupoR.ok) throw new Error("esperava criação do grupo");

  const p = await criarProposta(prisma, { tenantId, leadId, moeda: "BRL", preco: 5000, validade: dias(7) });
  await enviarProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  await aceitarProposta(prisma, { tenantId, propostaId: p.id });
  const bookingR = await criarBookingDaProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  if (!bookingR.ok) throw new Error("esperava criação do booking");
  await withTenant(prisma, tenantId, (tx) => tx.booking.update({ where: { id: bookingR.booking.id }, data: { tripId: trip.id, tripGroupId: grupoR.grupo.id } }));
  const travelerR = await adicionarTraveler(prisma, { tenantId, bookingId: bookingR.booking.id, nome: "Passageiro Checkin" });
  if (!travelerR.ok) throw new Error("esperava criação do traveler");

  return { trip, grupo: grupoR.grupo, booking: bookingR.booking, traveler: travelerR.traveler };
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (checkin teste)", slug: `checkin-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (checkin teste)", slug: `checkin-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `checkin-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
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
    await tx.travelerCheckIn.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.updateMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } }, data: { tripGroupId: null, tripId: null } });
    await tx.tripGroup.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.trip.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tourVehicle.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.traveler.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("Emissão de credencial", () => {
  it("emite token opaco, nunca um ID interno", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const r = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.token).toMatch(/^[a-f0-9]{48}$/);
    expect(r.token).not.toContain(traveler.id);
    expect(r.token).not.toContain(grupo.id);
  });
});

describe("Validação de credencial — nunca muda estado (§9A)", () => {
  it("token válido é aceito e o status continua AGENDADO após só validar", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");

    const v = await validarCredencial(prisma, tenantA.id, emissao.token);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.travelerCheckIn.status).toBe("AGENDADO");
  });

  it("token inexistente é rejeitado", async () => {
    const v = await validarCredencial(prisma, tenantA.id, "a".repeat(48));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("NAO_ENCONTRADA");
  });

  it("token expirado é rejeitado", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, ttlMs: -1000, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");

    const v = await validarCredencial(prisma, tenantA.id, emissao.token);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("EXPIRADA");
  });

  it("token revogado é rejeitado", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");
    await revogarCredencial(prisma, { tenantId: tenantA.id, travelerCheckInId: emissao.travelerCheckInId, actorType: "HUMANO", userId: userA.id });

    const v = await validarCredencial(prisma, tenantA.id, emissao.token);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("REVOGADA");
  });

  it("token de outro tenant é rejeitado (RLS — nunca vaza se existe ou não)", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");

    const v = await validarCredencial(prisma, tenantB.id, emissao.token);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("NAO_ENCONTRADA"); // mesmo motivo de "não existe" — não revela que pertence a outro tenant
  });

  it("payload malformado/malicioso é rejeitado SEM nunca ser interpretado (§7A)", async () => {
    const payloadsMaliciosos = [
      "javascript:alert(1)",
      "https://evil.example.com/steal?x=1",
      "<script>alert(1)</script>",
      "'; DROP TABLE traveler_checkins; --",
      "a".repeat(5000), // payload excessivo
      "",
      "   ",
      "not-a-hex-token-at-all",
      "a".repeat(47), // um char curto
      "a".repeat(49), // um char longo
      "ABCDEF0123456789ABCDEF0123456789ABCDEF01234567", // hex maiúsculo — formato exige minúsculo
    ];
    for (const payload of payloadsMaliciosos) {
      const v = await validarCredencial(prisma, tenantA.id, payload);
      expect(v.ok, `payload: ${JSON.stringify(payload).slice(0, 60)}`).toBe(false);
      if (!v.ok) expect(v.motivo).toBe("FORMATO_INVALIDO");
    }
  });
});

describe("Check-in — idempotente, nunca duplica (§10A/§18A replay)", () => {
  it("primeiro check-in muda o status e audita", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");

    const r = await confirmarCheckIn(prisma, { tenantId: tenantA.id, tokenBruto: emissao.token, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.travelerCheckIn.status).toBe("CHECKIN_REALIZADO");
      expect(r.jaAplicado).toBe(false);
    }

    const evento = await withSystem(prisma, (tx) => tx.auditLog.findFirstOrThrow({ where: { tenantId: tenantA.id, acao: "CHECKIN_REALIZADO" } }));
    expect(evento.resultado).toBe("ok");
  });

  it("replay (mesmo token, check-in de novo) é idempotente — não duplica, não falha", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");

    await confirmarCheckIn(prisma, { tenantId: tenantA.id, tokenBruto: emissao.token, actorType: "HUMANO", userId: userA.id });
    const segunda = await confirmarCheckIn(prisma, { tenantId: tenantA.id, tokenBruto: emissao.token, actorType: "HUMANO", userId: userA.id });
    expect(segunda.ok).toBe(true);
    if (segunda.ok) expect(segunda.jaAplicado).toBe(true);

    // Escopado ao registro específico (não só tenant+ação) — Audit não é
    // limpo entre testes deste arquivo, então uma contagem global contaria
    // eventos de outros testes do mesmo tenant.
    const eventos = await withSystem(prisma, (tx) => tx.auditLog.count({ where: { tenantId: tenantA.id, acao: "CHECKIN_REALIZADO", entidadeId: emissao.travelerCheckInId } }));
    expect(eventos).toBe(1); // nunca duplicado
  });
});

describe("Embarque — exige check-in prévio, idempotente, respeita capacidade (§12A/§14A)", () => {
  it("rejeita embarque sem check-in prévio", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");

    const r = await confirmarEmbarque(prisma, { tenantId: tenantA.id, tokenBruto: emissao.token, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("CHECKIN_NAO_REALIZADO");
  });

  it("embarca com sucesso após check-in, e duplo embarque é idempotente", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");
    await confirmarCheckIn(prisma, { tenantId: tenantA.id, tokenBruto: emissao.token, actorType: "HUMANO", userId: userA.id });

    const r1 = await confirmarEmbarque(prisma, { tenantId: tenantA.id, tokenBruto: emissao.token, actorType: "HUMANO", userId: userA.id });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.travelerCheckIn.status).toBe("EMBARCADO");
      expect(r1.jaAplicado).toBe(false);
    }

    const r2 = await confirmarEmbarque(prisma, { tenantId: tenantA.id, tokenBruto: emissao.token, actorType: "HUMANO", userId: userA.id });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.jaAplicado).toBe(true);

    const eventos = await withSystem(prisma, (tx) => tx.auditLog.count({ where: { tenantId: tenantA.id, acao: "EMBARQUE_REALIZADO", entidadeId: emissao.travelerCheckInId } }));
    expect(eventos).toBe(1);
  });

  it("rejeita embarque além da capacidade do veículo — validado no backend, não só visual", async () => {
    const { grupo } = await montarGrupoComPassageiro(tenantA.id, leadA.id, 1); // capacidade 1

    // segundo passageiro no MESMO grupo (booking separado, mesmo grupo)
    const p2 = await criarProposta(prisma, { tenantId: tenantA.id, leadId: leadA.id, moeda: "BRL", preco: 5000, validade: dias(7) });
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p2.id, actorType: "HUMANO", userId: userA.id });
    await aceitarProposta(prisma, { tenantId: tenantA.id, propostaId: p2.id });
    const booking2 = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: p2.id, actorType: "HUMANO", userId: userA.id });
    if (!booking2.ok) throw new Error("esperava criação do segundo booking");
    await withTenant(prisma, tenantA.id, (tx) => tx.booking.update({ where: { id: booking2.booking.id }, data: { tripId: grupo.tripId, tripGroupId: grupo.id } }));
    const traveler2 = await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: booking2.booking.id, nome: "Passageiro 2" });
    if (!traveler2.ok) throw new Error("esperava criação do segundo traveler");

    const travelersDoGrupo = await withTenant(prisma, tenantA.id, (tx) => tx.traveler.findMany({ where: { tenantId: tenantA.id, booking: { tripGroupId: grupo.id } } }));
    expect(travelersDoGrupo.length).toBe(2);

    const [t1, t2] = travelersDoGrupo;
    const e1 = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: t1!.id, actorType: "HUMANO", userId: userA.id });
    const e2 = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: t2!.id, actorType: "HUMANO", userId: userA.id });
    if (!e1.ok || !e2.ok) throw new Error("esperava emissão para os dois");

    await confirmarCheckIn(prisma, { tenantId: tenantA.id, tokenBruto: e1.token, actorType: "HUMANO", userId: userA.id });
    await confirmarCheckIn(prisma, { tenantId: tenantA.id, tokenBruto: e2.token, actorType: "HUMANO", userId: userA.id });

    const embarque1 = await confirmarEmbarque(prisma, { tenantId: tenantA.id, tokenBruto: e1.token, actorType: "HUMANO", userId: userA.id });
    expect(embarque1.ok).toBe(true); // ocupa a única vaga (capacidade 1)

    const embarque2 = await confirmarEmbarque(prisma, { tenantId: tenantA.id, tokenBruto: e2.token, actorType: "HUMANO", userId: userA.id });
    expect(embarque2.ok).toBe(false);
    if (!embarque2.ok) expect(embarque2.motivo).toBe("CAPACIDADE_EXCEDIDA");
  });
});

describe("No-show — só ação manual (§13A)", () => {
  it("marca no-show a partir de AGENDADO", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");

    const r = await marcarNoShow(prisma, { tenantId: tenantA.id, travelerCheckInId: emissao.travelerCheckInId, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.travelerCheckIn.status).toBe("NO_SHOW");
  });

  it("check-in após NO_SHOW é rejeitado", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");
    await marcarNoShow(prisma, { tenantId: tenantA.id, travelerCheckInId: emissao.travelerCheckInId, actorType: "HUMANO", userId: userA.id });

    const r = await confirmarCheckIn(prisma, { tenantId: tenantA.id, tokenBruto: emissao.token, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("NO_SHOW_OU_CANCELADO");
  });
});

describe("Audit nunca grava o token", () => {
  it("nenhum evento de Audit contém o token bruto ou o hash", async () => {
    const { grupo, traveler } = await montarGrupoComPassageiro(tenantA.id, leadA.id);
    const emissao = await emitirCredencial(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, travelerId: traveler.id, actorType: "HUMANO", userId: userA.id });
    if (!emissao.ok) throw new Error("esperava emissão");
    await confirmarCheckIn(prisma, { tenantId: tenantA.id, tokenBruto: emissao.token, actorType: "HUMANO", userId: userA.id });

    const eventos = await withSystem(prisma, (tx) => tx.auditLog.findMany({ where: { tenantId: tenantA.id, entidade: "TravelerCheckIn" } }));
    for (const e of eventos) {
      expect(JSON.stringify(e.detalhe)).not.toContain(emissao.token);
    }
  });
});
