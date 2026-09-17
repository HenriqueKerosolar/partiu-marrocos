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
  iniciarTracking,
  finalizarTracking,
  registrarPing,
  obterPosicoesAtivasDoGrupo,
  buscarSessaoAtivaDoProfissional,
  purgarPingsAntigos,
} from "../../src";

/**
 * PM-CONV-05, Track A — GPS/Mapas/Live Location. Cobre: tracking somente em
 * operação ativa, RLS/cross-tenant, coordenadas inválidas, idempotência de
 * início/fim, retenção.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };

const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function montarGrupoComProfissional(tenantId: string) {
  const trip = await criarTrip(prisma, { tenantId, roteiro: "Trip GPS", dataInicio: dias(5), dataFim: dias(10), timezone: "Africa/Casablanca", actorType: "HUMANO", userId: userA.id });
  const veiculoR = await criarTourVehicle(prisma, { tenantId, nome: `Van GPS ${Date.now()}`, capacidade: 10, actorType: "HUMANO", userId: userA.id });
  if (!veiculoR.ok) throw new Error("esperava criação do veículo");
  const grupoR = await criarTripGroup(prisma, { tenantId, tripId: trip.id, nome: "Grupo GPS", veiculoId: veiculoR.veiculo.id, actorType: "HUMANO", userId: userA.id });
  if (!grupoR.ok) throw new Error("esperava criação do grupo");
  const profissional = await criarProfessional(prisma, { tenantId, nome: `Guia GPS ${Date.now()}`, actorType: "HUMANO", userId: userA.id });
  const atribR = await atribuirProfissional(prisma, { tenantId, tripGroupId: grupoR.grupo.id, professionalId: profissional.id, papel: "GUIA", actorType: "HUMANO", userId: userA.id });
  if (!atribR.ok) throw new Error("esperava atribuição do profissional");
  return { grupo: grupoR.grupo, profissional };
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (gps teste)", slug: `gps-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (gps teste)", slug: `gps-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `gps-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
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
    await tx.tripGroupProfissional.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripGroup.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.professional.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tourVehicle.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.trip.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("Início de tracking — só profissional atribuído ao grupo", () => {
  it("inicia com sucesso e é idempotente (chamar duas vezes devolve a mesma sessão)", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const r1 = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.jaAtiva).toBe(false);

    const r2 = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.jaAtiva).toBe(true);
    expect(r2.trackingSession.id).toBe(r1.trackingSession.id);
  });

  it("PM-CONV-06 §6E — duas tentativas de início VERDADEIRAMENTE simultâneas (Promise.all, não sequenciais): só uma sessão é criada, nenhuma lança erro", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);

    // Promise.all (não await sequencial) — as duas transações concorrem de
    // verdade no Postgres, exercitando a reserva atômica (INSERT...ON
    // CONFLICT...DO NOTHING) em vez de só a idempotência sequencial já
    // coberta pelo teste acima.
    const [r1, r2] = await Promise.all([
      iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id }),
      iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id }),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    // Exatamente uma das duas venceu a corrida (jaAtiva: false); a outra
    // encontrou a sessão já existente — nunca as duas criam, nunca as duas
    // "perdem".
    expect([r1.jaAtiva, r2.jaAtiva].sort()).toEqual([false, true]);
    expect(r1.trackingSession.id).toBe(r2.trackingSession.id);

    const sessoesAtivas = await withTenant(prisma, tenantA.id, (tx) =>
      tx.trackingSession.findMany({ where: { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, status: "ATIVA" } }),
    );
    expect(sessoesAtivas).toHaveLength(1); // nunca duas sessões ATIVAS pro mesmo (grupo, profissional) — índice parcial + reserva atômica seguram isso
  });

  it("rejeita profissional não atribuído ao grupo", async () => {
    const { grupo } = await montarGrupoComProfissional(tenantA.id);
    const outroProfissional = await criarProfessional(prisma, { tenantId: tenantA.id, nome: `Fora do grupo ${Date.now()}`, actorType: "HUMANO", userId: userA.id });
    const r = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: outroProfissional.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("PROFISSIONAL_NAO_ATRIBUIDO_AO_GRUPO");
  });

  it("registra evento de auditoria ao iniciar e finalizar", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const r = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!r.ok) throw new Error("esperava sucesso");
    await finalizarTracking(prisma, { tenantId: tenantA.id, trackingSessionId: r.trackingSession.id, actorType: "HUMANO", userId: userA.id });

    const eventos = await withSystem(prisma, (tx) => tx.auditLog.findMany({ where: { tenantId: tenantA.id, entidadeId: r.trackingSession.id } }));
    expect(eventos.map((e) => e.acao)).toEqual(expect.arrayContaining(["TRACKING_SESSION_INICIADA", "TRACKING_SESSION_FINALIZADA"]));
  });
});

describe("Ping — nunca fora de sessão ATIVA (§ tracking só em operação ativa)", () => {
  it("aceita ping com sessão ATIVA", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava sucesso");

    const pingR = await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.6295, longitude: -7.9811, capturedAt: new Date() });
    expect(pingR.ok).toBe(true);
  });

  it("rejeita ping depois que a sessão foi finalizada", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava sucesso");
    await finalizarTracking(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, actorType: "HUMANO", userId: userA.id });

    const pingR = await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.6295, longitude: -7.9811, capturedAt: new Date() });
    expect(pingR.ok).toBe(false);
    if (!pingR.ok) expect(pingR.motivo).toBe("SESSAO_FINALIZADA");
  });

  it("rejeita sessão inexistente", async () => {
    const pingR = await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: "00000000-0000-0000-0000-000000000000", latitude: 0, longitude: 0, capturedAt: new Date() });
    expect(pingR.ok).toBe(false);
    if (!pingR.ok) expect(pingR.motivo).toBe("SESSAO_NAO_ENCONTRADA");
  });

  it.each([
    [91, 0],
    [-91, 0],
    [0, 181],
    [0, -181],
    [NaN, 0],
    [0, Infinity],
  ])("rejeita coordenada inválida (%d, %d) antes de tocar o banco", async (latitude, longitude) => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava sucesso");

    const pingR = await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude, longitude, capturedAt: new Date() });
    expect(pingR.ok).toBe(false);
    if (!pingR.ok) expect(pingR.motivo).toBe("COORDENADA_INVALIDA");
  });
});

describe("Mapa operacional — última posição por sessão ATIVA", () => {
  it("devolve a posição mais recente, não a primeira", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava sucesso");

    await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.0, longitude: -7.0, capturedAt: new Date(Date.now() - 60_000) });
    await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.5, longitude: -7.5, capturedAt: new Date() });

    const posicoes = await obterPosicoesAtivasDoGrupo(prisma, tenantA.id, grupo.id);
    expect(posicoes).toHaveLength(1);
    expect(posicoes[0]!.latitude).toBe(31.5);
    expect(posicoes[0]!.professionalNome).toBe(profissional.nome);
  });

  it("sessão finalizada não aparece no mapa", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava sucesso");
    await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.5, longitude: -7.5, capturedAt: new Date() });
    await finalizarTracking(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, actorType: "HUMANO", userId: userA.id });

    const posicoes = await obterPosicoesAtivasDoGrupo(prisma, tenantA.id, grupo.id);
    expect(posicoes).toHaveLength(0);
  });

  it("buscarSessaoAtivaDoProfissional acha a sessão do próprio profissional", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });

    const sessao = await buscarSessaoAtivaDoProfissional(prisma, tenantA.id, profissional.id);
    expect(sessao?.professionalId).toBe(profissional.id);
  });
});

describe("RLS — isolamento multi-tenant", () => {
  it("Tenant B não vê posições nem sessões do Tenant A", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava sucesso");
    await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.5, longitude: -7.5, capturedAt: new Date() });

    const posicoesTenantB = await obterPosicoesAtivasDoGrupo(prisma, tenantB.id, grupo.id);
    expect(posicoesTenantB).toHaveLength(0);

    const pingCrossTenant = await registrarPing(prisma, { tenantId: tenantB.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 0, longitude: 0, capturedAt: new Date() });
    expect(pingCrossTenant.ok).toBe(false);
    if (!pingCrossTenant.ok) expect(pingCrossTenant.motivo).toBe("SESSAO_NAO_ENCONTRADA");
  });
});

describe("Retenção — purga só pings antigos de sessão FINALIZADA", () => {
  it("nunca purga ping de sessão ainda ATIVA, mesmo antigo", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava sucesso");
    await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.5, longitude: -7.5, capturedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) });

    const purgados = await purgarPingsAntigos(prisma, tenantA.id, 90);
    expect(purgados).toBe(0);

    const restantes = await withSystem(prisma, (tx) => tx.geolocationPing.count({ where: { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id } }));
    expect(restantes).toBe(1);
  });

  it("purga ping antigo de sessão FINALIZADA, preserva o recente", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const sessaoR = await iniciarTracking(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, actorType: "HUMANO", userId: userA.id });
    if (!sessaoR.ok) throw new Error("esperava sucesso");
    await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.0, longitude: -7.0, capturedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) });
    await registrarPing(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, latitude: 31.5, longitude: -7.5, capturedAt: new Date() });
    await finalizarTracking(prisma, { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id, actorType: "HUMANO", userId: userA.id });

    const purgados = await purgarPingsAntigos(prisma, tenantA.id, 90);
    expect(purgados).toBe(1);

    const restantes = await withSystem(prisma, (tx) => tx.geolocationPing.findMany({ where: { tenantId: tenantA.id, trackingSessionId: sessaoR.trackingSession.id } }));
    expect(restantes).toHaveLength(1);
    expect(restantes[0]!.latitude).toBe(31.5);
  });
});
