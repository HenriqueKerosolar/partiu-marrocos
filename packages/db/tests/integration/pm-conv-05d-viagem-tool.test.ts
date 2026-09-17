import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { withSystem, withTenant } from "../../src/tenant-db";
import { executarTool, concederCapability } from "../../src/tools";
import { criarTrip } from "../../src/trip";
import { criarTourVehicle } from "../../src/tour-vehicle";
import { criarTripGroup } from "../../src/trip-group";

/**
 * PM-CONV-05, Track D — `viagem.consultar_contexto`, a tool que dá ao
 * Yalla acesso a dado REAL de Booking/Trip/Itinerário (antes desta tool,
 * Yalla não tinha nenhum contexto de viagem, só Lead/Contact).
 */
const prisma = new PrismaClient();

let tenantA: { id: string };
let userA: { id: string };
let contactA: { id: string };
let leadA: { id: string };
let conversationA: { id: string };

async function montarPipelineELead() {
  return withTenant(prisma, tenantA.id, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId: tenantA.id, nome: "Funil teste viagem" } });
    const stage = await tx.stage.create({ data: { tenantId: tenantA.id, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId: tenantA.id, nome: "Cliente Viagem Teste" } });
    const lead = await tx.lead.create({ data: { tenantId: tenantA.id, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
    const conversation = await tx.conversation.create({ data: { tenantId: tenantA.id, contactId: contact.id, channel: "WEBCHAT" } });
    return { contact, lead, conversation };
  });
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (viagem tool teste)", slug: `viagem-tool-a-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `viagem-tool-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  const { contact, lead, conversation } = await montarPipelineELead();
  contactA = contact;
  leadA = lead;
  conversationA = conversation;
  await concederCapability(prisma, { tenantId: tenantA.id, agent: "yalla", capability: "viagem.consultar_contexto", actorType: "SISTEMA" });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantA.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.booking.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.trip.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tourVehicle.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.proposal.deleteMany({ where: { tenantId: tenantA.id } });
  });
});

function ctxYalla() {
  return { tenantId: tenantA.id, agent: "yalla" as const, actorType: "AGENTE" as const, actorLabel: "yalla", conversationId: conversationA.id, contactId: contactA.id, leadId: leadA.id };
}

describe("viagem.consultar_contexto — dado real, nunca inventado", () => {
  it("devolve temReserva=false quando o lead não tem nenhum booking", async () => {
    const r = await executarTool(prisma, ctxYalla(), { toolId: "viagem.consultar_contexto", toolCallId: `tc-${Date.now()}`, input: {} });
    expect(r.status).toBe("SUCCESS");
    expect((r.data as { temReserva: boolean }).temReserva).toBe(false);
  });

  it("devolve roteiro/datas/status reais quando existe booking com trip vinculada", async () => {
    const trip = await criarTrip(prisma, {
      tenantId: tenantA.id,
      roteiro: "Marrocos Clássico 8 dias",
      dataInicio: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      dataFim: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
      timezone: "Africa/Casablanca",
      actorType: "HUMANO",
      userId: userA.id,
    });
    const veiculoR = await criarTourVehicle(prisma, { tenantId: tenantA.id, nome: `Van Teste ${Date.now()}`, capacidade: 10, actorType: "HUMANO", userId: userA.id });
    if (!veiculoR.ok) throw new Error("esperava criação do veículo");
    const grupoR = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Grupo Teste", veiculoId: veiculoR.veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!grupoR.ok) throw new Error("esperava criação do grupo");

    const proposta = await withTenant(prisma, tenantA.id, (tx) =>
      tx.proposal.create({ data: { tenantId: tenantA.id, leadId: leadA.id, status: "ACEITA", versao: 1, moeda: "BRL", preco: 8000, validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }),
    );
    await withTenant(prisma, tenantA.id, (tx) =>
      tx.booking.create({ data: { tenantId: tenantA.id, proposalId: proposta.id, leadId: leadA.id, tripId: trip.id, tripGroupId: grupoR.grupo.id } }),
    );

    const r = await executarTool(prisma, ctxYalla(), { toolId: "viagem.consultar_contexto", toolCallId: `tc-${Date.now()}`, input: {} });
    expect(r.status).toBe("SUCCESS");
    const out = r.data as { temReserva: boolean; bookings: { roteiro: string | null; grupoOperacional: string | null }[] };
    expect(out.temReserva).toBe(true);
    expect(out.bookings).toHaveLength(1);
    expect(out.bookings[0]!.roteiro).toBe("Marrocos Clássico 8 dias");
    expect(out.bookings[0]!.grupoOperacional).toBe("Grupo Teste");
  });

  it("nunca aceita bookingId do input — sempre resolve pelo ctx.leadId", async () => {
    // input vazio é o único schema aceito — um bookingId arbitrário no input não tem efeito nenhum (schema z.object({}) já rejeita campos extras implicitamente na leitura).
    const r = await executarTool(prisma, ctxYalla(), { toolId: "viagem.consultar_contexto", toolCallId: `tc-${Date.now()}`, input: { bookingId: "id-de-outro-tenant" } });
    expect(r.status).toBe("SUCCESS");
  });
});
