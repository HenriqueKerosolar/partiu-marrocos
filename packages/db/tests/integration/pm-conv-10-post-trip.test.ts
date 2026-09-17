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
  registrarAvaliacao,
  publicarDepoimento,
  despublicarDepoimento,
  listarAvaliacoesDoTenant,
  buscarAvaliacaoDoBooking,
} from "../../src";

/**
 * PM-CONV-10 — Post-Trip Foundation. Avaliação/NPS + depoimento com
 * consentimento explícito — nunca publicação automática (garantido também
 * por CHECK constraint no banco, não só em código).
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };
let leadA: { id: string };

const VALIDADE_FUTURA = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (post-trip teste)", slug: `pt-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (post-trip teste)", slug: `pt-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `pt-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: role.id } });
  });
  await withTenant(prisma, tenantA.id, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId: tenantA.id, nome: "Funil post-trip" } });
    const stage = await tx.stage.create({ data: { tenantId: tenantA.id, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId: tenantA.id, nome: "Cliente Post-Trip" } });
    leadA = await tx.lead.create({ data: { tenantId: tenantA.id, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
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
    await tx.tripReview.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

async function criarBookingConcluido(tenantId: string, preco = 4000) {
  const proposta = await criarProposta(prisma, { tenantId, leadId: leadA.id, moeda: "BRL", preco, validade: VALIDADE_FUTURA() });
  await enviarProposta(prisma, { tenantId, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
  await aceitarProposta(prisma, { tenantId, propostaId: proposta.id });
  const bookingR = await criarBookingDaProposta(prisma, { tenantId, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
  if (!bookingR.ok) throw new Error("esperava criação do booking");
  await moverBookingStatus(prisma, { tenantId, bookingId: bookingR.booking.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });
  await moverBookingStatus(prisma, { tenantId, bookingId: bookingR.booking.id, novoStatus: "CONFIRMADA", actorType: "HUMANO", userId: userA.id });
  await moverBookingStatus(prisma, { tenantId, bookingId: bookingR.booking.id, novoStatus: "EM_OPERACAO", actorType: "HUMANO", userId: userA.id });
  await moverBookingStatus(prisma, { tenantId, bookingId: bookingR.booking.id, novoStatus: "CONCLUIDA", actorType: "HUMANO", userId: userA.id });
  return bookingR.booking;
}

describe("registrarAvaliacao — só depois da viagem CONCLUIDA, uma por reserva", () => {
  it("viagem ainda não concluída é rejeitada", async () => {
    const proposta = await criarProposta(prisma, { tenantId: tenantA.id, leadId: leadA.id, moeda: "BRL", preco: 2000, validade: VALIDADE_FUTURA() });
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    await aceitarProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id });
    const bookingR = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!bookingR.ok) throw new Error("esperava criação do booking");

    const r = await registrarAvaliacao(prisma, { tenantId: tenantA.id, bookingId: bookingR.booking.id, nota: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("VIAGEM_NAO_CONCLUIDA");
  });

  it("nota fora de 1–5 é rejeitada antes de qualquer escrita", async () => {
    const booking = await criarBookingConcluido(tenantA.id);
    const r = await registrarAvaliacao(prisma, { tenantId: tenantA.id, bookingId: booking.id, nota: 6 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("NOTA_INVALIDA");
  });

  it("registra com sucesso quando CONCLUIDA, e uma segunda avaliação da mesma reserva é rejeitada", async () => {
    const booking = await criarBookingConcluido(tenantA.id);
    const r1 = await registrarAvaliacao(prisma, { tenantId: tenantA.id, bookingId: booking.id, nota: 5, comentario: "Ótima viagem!", depoimentoAutorizado: true });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.review.depoimentoPublicado).toBe(false); // consentimento nunca publica sozinho
    }

    const r2 = await registrarAvaliacao(prisma, { tenantId: tenantA.id, bookingId: booking.id, nota: 3 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.motivo).toBe("JA_AVALIADA");
  });
});

describe("publicarDepoimento — sempre decisão humana separada, exige consentimento prévio", () => {
  it("sem depoimentoAutorizado, publicar é rejeitado", async () => {
    const booking = await criarBookingConcluido(tenantA.id);
    const av = await registrarAvaliacao(prisma, { tenantId: tenantA.id, bookingId: booking.id, nota: 4 }); // depoimentoAutorizado omitido = false
    if (!av.ok) throw new Error("esperava registro");

    const r = await publicarDepoimento(prisma, { tenantId: tenantA.id, tripReviewId: av.review.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("SEM_CONSENTIMENTO");
  });

  it("com consentimento, publicar funciona e é reversível (despublicar)", async () => {
    const booking = await criarBookingConcluido(tenantA.id);
    const av = await registrarAvaliacao(prisma, { tenantId: tenantA.id, bookingId: booking.id, nota: 5, depoimentoAutorizado: true });
    if (!av.ok) throw new Error("esperava registro");

    const publicado = await publicarDepoimento(prisma, { tenantId: tenantA.id, tripReviewId: av.review.id, actorType: "HUMANO", userId: userA.id });
    expect(publicado.ok).toBe(true);
    if (publicado.ok) {
      expect(publicado.review.depoimentoPublicado).toBe(true);
      expect(publicado.review.publicadoPorId).toBe(userA.id);
    }

    const despublicado = await despublicarDepoimento(prisma, { tenantId: tenantA.id, tripReviewId: av.review.id, actorType: "HUMANO", userId: userA.id });
    expect(despublicado.ok).toBe(true);
    if (despublicado.ok) expect(despublicado.review.depoimentoPublicado).toBe(false);
  });
});

describe("Integridade em banco (defesa em profundidade, não só validação de aplicação)", () => {
  it("CHECK constraint recusa depoimento_publicado=true sem depoimento_autorizado=true, mesmo via SQL direto", async () => {
    const booking = await criarBookingConcluido(tenantA.id);
    const av = await registrarAvaliacao(prisma, { tenantId: tenantA.id, bookingId: booking.id, nota: 5 }); // depoimentoAutorizado=false
    if (!av.ok) throw new Error("esperava registro");

    await expect(
      withSystem(prisma, (tx) => tx.$executeRaw`UPDATE trip_reviews SET depoimento_publicado = true WHERE id = ${av.review.id}`),
    ).rejects.toThrow();
  });
});

describe("Consultas e isolamento multi-tenant (RLS)", () => {
  it("Tenant B não lista nem encontra avaliação do Tenant A", async () => {
    const booking = await criarBookingConcluido(tenantA.id);
    await registrarAvaliacao(prisma, { tenantId: tenantA.id, bookingId: booking.id, nota: 5 });

    const listaB = await listarAvaliacoesDoTenant(prisma, tenantB.id);
    expect(listaB).toHaveLength(0);

    const buscaB = await buscarAvaliacaoDoBooking(prisma, tenantB.id, booking.id);
    expect(buscaB).toBeNull();
  });

  it("listarAvaliacoesDoTenant reflete o que foi criado no próprio tenant", async () => {
    const booking = await criarBookingConcluido(tenantA.id, 1500);
    await registrarAvaliacao(prisma, { tenantId: tenantA.id, bookingId: booking.id, nota: 4 });

    const lista = await listarAvaliacoesDoTenant(prisma, tenantA.id);
    expect(lista.map((r) => r.bookingId)).toContain(booking.id);
  });
});
