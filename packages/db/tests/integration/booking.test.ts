import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withSystem,
  withTenant,
  criarProposta,
  enviarProposta,
  aceitarProposta,
  criarBookingDaProposta,
  moverBookingStatus,
  adicionarTraveler,
  removerTraveler,
  listarTravelers,
  listarBookingsDoLead,
  buscarBooking,
} from "../../src";

/**
 * Booking Foundation 01 (PM-NIGHT-RUN-02, Etapa 1). Mesmo critério de teste
 * negativo real das outras suítes — provar ativamente que uma Proposal só
 * gera UM Booking (idempotência estrutural), que a máquina de estados
 * bloqueia transição inválida, e isolamento multi-tenant real.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };
let leadA: { id: string };
let leadB: { id: string };

const VALIDADE_FUTURA = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

async function criarLeadPara(tenantId: string, sufixo: string) {
  return withTenant(prisma, tenantId, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId, nome: `Funil ${sufixo}` } });
    const stage = await tx.stage.create({ data: { tenantId, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId, nome: `Cliente ${sufixo}` } });
    return tx.lead.create({ data: { tenantId, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
  });
}

async function criarPropostaAceitaPara(tenantId: string, leadId: string) {
  const p = await criarProposta(prisma, { tenantId, leadId, moeda: "BRL", preco: 5000, validade: VALIDADE_FUTURA() });
  await enviarProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  await aceitarProposta(prisma, { tenantId, propostaId: p.id });
  return p;
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (booking teste)", slug: `book-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (booking teste)", slug: `book-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `book-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: role.id } });
  });
  leadA = await criarLeadPara(tenantA.id, "A");
  leadB = await criarLeadPara(tenantB.id, "B");
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
    await tx.traveler.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("Booking — criação a partir de Proposal ACEITA", () => {
  it("cria Booking com status inicial AGUARDANDO_PAGAMENTO", async () => {
    const proposta = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const r = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.criado).toBe(true);
      expect(r.booking.status).toBe("AGUARDANDO_PAGAMENTO");
      expect(r.booking.leadId).toBe(leadA.id);
    }
  });

  it("Proposal RASCUNHO/ENVIADA (não ACEITA) não pode gerar Booking", async () => {
    const rascunho = await criarProposta(prisma, { tenantId: tenantA.id, leadId: leadA.id, moeda: "BRL", preco: 3000, validade: VALIDADE_FUTURA() });
    const r1 = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: rascunho.id, actorType: "HUMANO", userId: userA.id });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.motivo).toBe("PROPOSTA_NAO_ACEITA");

    const enviada = await criarProposta(prisma, { tenantId: tenantA.id, leadId: leadA.id, moeda: "BRL", preco: 3000, validade: VALIDADE_FUTURA() });
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: enviada.id, actorType: "HUMANO", userId: userA.id });
    const r2 = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: enviada.id, actorType: "HUMANO", userId: userA.id });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.motivo).toBe("PROPOSTA_NAO_ACEITA");
  });

  it("idempotência estrutural: chamar duas vezes pra mesma Proposal retorna o MESMO Booking, nunca duplica", async () => {
    const proposta = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const r1 = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    const r2 = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r2.criado).toBe(false); // segunda chamada não cria de novo
      expect(r2.booking.id).toBe(r1.booking.id);
    }
    const todos = await withTenant(prisma, tenantA.id, (tx) => tx.booking.findMany({ where: { tenantId: tenantA.id, proposalId: proposta.id } }));
    expect(todos).toHaveLength(1);
  });

  it("duas Proposals ACEITAS diferentes do mesmo lead geram Bookings diferentes", async () => {
    const p1 = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const p2 = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const r1 = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: p1.id, actorType: "HUMANO", userId: userA.id });
    const r2 = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: p2.id, actorType: "HUMANO", userId: userA.id });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) expect(r1.booking.id).not.toBe(r2.booking.id);
  });
});

describe("Booking — máquina de estados aplicada de verdade contra o banco", () => {
  it("transição válida é aplicada e auditada", async () => {
    const proposta = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const criado = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!criado.ok) throw new Error("esperava criação");

    const r = await moverBookingStatus(prisma, { tenantId: tenantA.id, bookingId: criado.booking.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.booking.status).toBe("PAGO");

    const evento = await withSystem(prisma, (tx) => tx.auditLog.findFirstOrThrow({ where: { tenantId: tenantA.id, entidadeId: criado.booking.id, acao: "BOOKING_STATUS_ALTERADO" } }));
    expect(evento.resultado).toBe("ok");
  });

  it("transição inválida é rejeitada, status no banco não muda", async () => {
    const proposta = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const criado = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!criado.ok) throw new Error("esperava criação");

    // AGUARDANDO_PAGAMENTO → CONFIRMADA não é uma transição válida (precisa passar por PAGO)
    const r = await moverBookingStatus(prisma, { tenantId: tenantA.id, bookingId: criado.booking.id, novoStatus: "CONFIRMADA", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("TRANSICAO_INVALIDA");

    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.booking.findUniqueOrThrow({ where: { id: criado.booking.id } }));
    expect(releitura.status).toBe("AGUARDANDO_PAGAMENTO");
  });

  it("estado terminal (CANCELADA) nunca sai do lugar", async () => {
    const proposta = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const criado = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!criado.ok) throw new Error("esperava criação");

    await moverBookingStatus(prisma, { tenantId: tenantA.id, bookingId: criado.booking.id, novoStatus: "CANCELADA", actorType: "HUMANO", userId: userA.id });
    const r = await moverBookingStatus(prisma, { tenantId: tenantA.id, bookingId: criado.booking.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
  });
});

describe("Booking — travelers (passageiros), privacy-by-design", () => {
  it("adiciona e lista passageiros de um booking", async () => {
    const proposta = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const criado = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!criado.ok) throw new Error("esperava criação");

    await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: criado.booking.id, nome: "Ana Silva", tipo: "ADULTO" });
    await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: criado.booking.id, nome: "Pedro Silva", tipo: "CRIANCA", dataNascimento: new Date("2018-01-01") });

    const travelers = await listarTravelers(prisma, tenantA.id, criado.booking.id);
    expect(travelers).toHaveLength(2);
    expect(travelers.map((t) => t.nome).sort()).toEqual(["Ana Silva", "Pedro Silva"]);
  });

  it("remove um passageiro", async () => {
    const proposta = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const criado = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!criado.ok) throw new Error("esperava criação");

    const r = await adicionarTraveler(prisma, { tenantId: tenantA.id, bookingId: criado.booking.id, nome: "Ana Silva" });
    if (!r.ok) throw new Error("esperava sucesso");
    const removido = await removerTraveler(prisma, { tenantId: tenantA.id, travelerId: r.traveler.id });
    expect(removido).toBe(true);

    const travelers = await listarTravelers(prisma, tenantA.id, criado.booking.id);
    expect(travelers).toHaveLength(0);
  });
});

describe("Booking — isolamento multi-tenant (RLS)", () => {
  it("Tenant B não lista Booking do Tenant A", async () => {
    const proposta = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });

    const listagemB = await listarBookingsDoLead(prisma, tenantB.id, leadB.id);
    expect(listagemB).toHaveLength(0);
  });

  it("Tenant B não consegue criar Booking apontando pra Proposal do Tenant A (FK composta protege)", async () => {
    const proposta = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const r = await criarBookingDaProposta(prisma, { tenantId: tenantB.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    // withTenant(tenantB) não enxerga a Proposal do tenant A (RLS) — nunca encontra, nunca cria booking indevido
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("PROPOSTA_NAO_ENCONTRADA");
  });

  it("Tenant B não lê Booking do Tenant A por id direto (buscarBooking)", async () => {
    const proposta = await criarPropostaAceitaPara(tenantA.id, leadA.id);
    const criado = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!criado.ok) throw new Error("esperava criação");

    const resultado = await buscarBooking(prisma, tenantB.id, criado.booking.id);
    expect(resultado).toBeNull();
  });
});
