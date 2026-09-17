import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withSystem,
  criarTrip,
  criarTourVehicle,
  criarTripGroup,
  criarProfessional,
  atribuirProfissional,
  registrarOcorrencia,
  listarOcorrenciasDoGrupo,
} from "../../src";

/**
 * PM-CONV-05, Track B — ocorrência operacional. Append-only, sempre ligada
 * a um profissional efetivamente atribuído ao grupo, nunca a um lead.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };

const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function montarGrupoComProfissional(tenantId: string) {
  const trip = await criarTrip(prisma, { tenantId, roteiro: "Trip Ocorrência", dataInicio: dias(3), dataFim: dias(8), timezone: "Africa/Casablanca", actorType: "HUMANO", userId: userA.id });
  const veiculoR = await criarTourVehicle(prisma, { tenantId, nome: `Van Ocorrência ${Date.now()}`, capacidade: 10, actorType: "HUMANO", userId: userA.id });
  if (!veiculoR.ok) throw new Error("esperava veiculo");
  const grupoR = await criarTripGroup(prisma, { tenantId, tripId: trip.id, nome: "Grupo Ocorrência", veiculoId: veiculoR.veiculo.id, actorType: "HUMANO", userId: userA.id });
  if (!grupoR.ok) throw new Error("esperava grupo");
  const profissional = await criarProfessional(prisma, { tenantId, nome: `Guia Ocorrência ${Date.now()}`, actorType: "HUMANO", userId: userA.id });
  await atribuirProfissional(prisma, { tenantId, tripGroupId: grupoR.grupo.id, professionalId: profissional.id, papel: "MOTORISTA", actorType: "HUMANO", userId: userA.id });
  return { grupo: grupoR.grupo, profissional };
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (ocorrencia teste)", slug: `ocorrencia-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (ocorrencia teste)", slug: `ocorrencia-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `ocorrencia-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
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
    await tx.tripIncident.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripGroupProfissional.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tripGroup.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.professional.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.tourVehicle.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.trip.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("registrarOcorrencia", () => {
  it("registra com sucesso quando profissional está atribuído ao grupo", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const r = await registrarOcorrencia(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, descricao: "Ônibus atrasou 40min por trânsito.", severidade: "ALTA", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ocorrencia.severidade).toBe("ALTA");

    const lista = await listarOcorrenciasDoGrupo(prisma, tenantA.id, grupo.id);
    expect(lista).toHaveLength(1);
  });

  it("rejeita profissional não atribuído ao grupo", async () => {
    const { grupo } = await montarGrupoComProfissional(tenantA.id);
    const outroProfissional = await criarProfessional(prisma, { tenantId: tenantA.id, nome: `Fora ${Date.now()}`, actorType: "HUMANO", userId: userA.id });
    const r = await registrarOcorrencia(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: outroProfissional.id, descricao: "x", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("PROFISSIONAL_NAO_ATRIBUIDO_AO_GRUPO");
  });

  it("rejeita descrição vazia", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const r = await registrarOcorrencia(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, descricao: "   ", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("DESCRICAO_VAZIA");
  });

  it("registra evento de auditoria", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    const r = await registrarOcorrencia(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, descricao: "Passageiro passou mal.", actorType: "HUMANO", userId: userA.id });
    if (!r.ok) throw new Error("esperava sucesso");

    const eventos = await withSystem(prisma, (tx) => tx.auditLog.findMany({ where: { tenantId: tenantA.id, entidadeId: r.ocorrencia.id, acao: "OCORRENCIA_REGISTRADA" } }));
    expect(eventos).toHaveLength(1);
  });

  it("RLS: Tenant B não vê ocorrências do Tenant A", async () => {
    const { grupo, profissional } = await montarGrupoComProfissional(tenantA.id);
    await registrarOcorrencia(prisma, { tenantId: tenantA.id, tripGroupId: grupo.id, professionalId: profissional.id, descricao: "x", actorType: "HUMANO", userId: userA.id });
    const listaB = await listarOcorrenciasDoGrupo(prisma, tenantB.id, grupo.id);
    expect(listaB).toHaveLength(0);
  });
});
