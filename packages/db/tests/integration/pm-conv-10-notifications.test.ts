import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withSystem,
  withTenant,
  criarNotificacao,
  listarNotificacoesDoUsuario,
  contarNaoLidas,
  marcarComoLida,
  marcarTodasComoLidas,
  criarProposta,
  enviarProposta,
  aceitarProposta,
  criarBookingDaProposta,
  criarPayment,
  registrarResultadoPayment,
} from "../../src";

/**
 * PM-CONV-10 — Notifications Foundation. Domínio genérico novo (canal
 * IN_APP real, sem credencial nenhuma) + o primeiro evento real cabeado
 * (pagamento recebido → Booking.responsavelId, ver payment.ts).
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };
let userB: { id: string };
let leadA: { id: string };

const VALIDADE_FUTURA = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (notif teste)", slug: `notif-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (notif teste)", slug: `notif-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `notif-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  userB = await prisma.user.create({ data: { email: `notif-b-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const roleA = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: roleA.id } });
    const roleB = await tx.role.create({ data: { tenantId: tenantB.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userB.id, tenantId: tenantB.id, roleId: roleB.id } });
  });
  await withTenant(prisma, tenantA.id, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId: tenantA.id, nome: "Funil notif" } });
    const stage = await tx.stage.create({ data: { tenantId: tenantA.id, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId: tenantA.id, nome: "Cliente Notif" } });
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
    await tx.notification.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.payment.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("Notifications — criação, leitura e marcação", () => {
  it("cria uma notificação IN_APP e lista pro destinatário certo, não lida por padrão", async () => {
    const n = await criarNotificacao(prisma, { tenantId: tenantA.id, destinatarioId: userA.id, tipo: "teste", titulo: "Título", corpo: "Corpo" });
    expect(n.canal).toBe("IN_APP");
    expect(n.lida).toBe(false);

    const lista = await listarNotificacoesDoUsuario(prisma, tenantA.id, userA.id);
    expect(lista.map((x) => x.id)).toContain(n.id);
    expect(await contarNaoLidas(prisma, tenantA.id, userA.id)).toBe(1);
  });

  it("marcarComoLida só funciona pro próprio destinatário — outro usuário nunca marca a notificação de alguém", async () => {
    const n = await criarNotificacao(prisma, { tenantId: tenantA.id, destinatarioId: userA.id, tipo: "teste", titulo: "T", corpo: "C" });

    const outroUser = await prisma.user.create({ data: { email: `intruso-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
    const rIntruso = await marcarComoLida(prisma, tenantA.id, n.id, outroUser.id);
    expect(rIntruso.ok).toBe(false);
    if (!rIntruso.ok) expect(rIntruso.motivo).toBe("NAO_ENCONTRADA");

    const rDono = await marcarComoLida(prisma, tenantA.id, n.id, userA.id);
    expect(rDono.ok).toBe(true);
    if (rDono.ok) expect(rDono.notification.lida).toBe(true);

    await withSystem(prisma, (tx) => tx.user.delete({ where: { id: outroUser.id } }));
  });

  it("marcarTodasComoLidas zera o contador de não lidas", async () => {
    await criarNotificacao(prisma, { tenantId: tenantA.id, destinatarioId: userA.id, tipo: "t1", titulo: "1", corpo: "1" });
    await criarNotificacao(prisma, { tenantId: tenantA.id, destinatarioId: userA.id, tipo: "t2", titulo: "2", corpo: "2" });
    expect(await contarNaoLidas(prisma, tenantA.id, userA.id)).toBe(2);

    const marcadas = await marcarTodasComoLidas(prisma, tenantA.id, userA.id);
    expect(marcadas).toBe(2);
    expect(await contarNaoLidas(prisma, tenantA.id, userA.id)).toBe(0);
  });

  it("isolamento multi-tenant (RLS): Tenant B não lista nem conta notificações do Tenant A", async () => {
    await criarNotificacao(prisma, { tenantId: tenantA.id, destinatarioId: userA.id, tipo: "teste", titulo: "T", corpo: "C" });
    const listaB = await listarNotificacoesDoUsuario(prisma, tenantB.id, userA.id);
    expect(listaB).toHaveLength(0);
  });
});

describe("Notifications — evento real cabeado: pagamento recebido", () => {
  it("Booking pago integralmente notifica o responsável", async () => {
    const proposta = await criarProposta(prisma, { tenantId: tenantA.id, leadId: leadA.id, moeda: "BRL", preco: 5000, validade: VALIDADE_FUTURA() });
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    await aceitarProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id });
    const bookingR = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, responsavelId: userA.id, actorType: "HUMANO", userId: userA.id });
    if (!bookingR.ok) throw new Error("esperava criação do booking");

    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: bookingR.booking.id, valor: 5000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação do payment");
    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });

    const notificacoes = await listarNotificacoesDoUsuario(prisma, tenantA.id, userA.id);
    const doPagamento = notificacoes.find((n) => n.tipo === "pagamento_recebido" && n.entidadeId === bookingR.booking.id);
    expect(doPagamento).toBeDefined();
    expect(doPagamento?.lida).toBe(false);
  });

  it("Booking sem responsavelId não gera notificação nenhuma (nunca lança erro por falta de destinatário)", async () => {
    const proposta = await criarProposta(prisma, { tenantId: tenantA.id, leadId: leadA.id, moeda: "BRL", preco: 3000, validade: VALIDADE_FUTURA() });
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    await aceitarProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id });
    const bookingR = await criarBookingDaProposta(prisma, { tenantId: tenantA.id, propostaId: proposta.id, actorType: "HUMANO", userId: userA.id });
    if (!bookingR.ok) throw new Error("esperava criação do booking");

    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: bookingR.booking.id, valor: 3000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação do payment");
    const r = await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true); // nunca falha por falta de responsável

    const notificacoes = await listarNotificacoesDoUsuario(prisma, tenantA.id, userA.id);
    expect(notificacoes.find((n) => n.entidadeId === bookingR.booking.id)).toBeUndefined();
  });
});
