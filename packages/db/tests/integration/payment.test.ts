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
  criarPayment,
  registrarResultadoPayment,
  solicitarEstornoPayment,
  confirmarEstornoAposAprovacaoGate,
  listarPaymentsDoBooking,
  resumoPagamentoBooking,
  decidirGate,
} from "../../src";

/**
 * Payment Foundation 01 (PM-NIGHT-RUN-02, Etapa 2). PAYMENT DOMAIN
 * IMPLEMENTED, nunca PAYMENT PROVIDER LIVE — todo teste aqui é modo
 * MANUAL/OFFLINE, nenhuma chamada de rede, nenhum gateway. Mesmo critério
 * de teste negativo real — estorno sempre via Gate, nunca autoaprovado,
 * e nunca duplicado por reconfirmação.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };
let leadA: { id: string };

const VALIDADE_FUTURA = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

async function criarLeadPara(tenantId: string, sufixo: string) {
  return withTenant(prisma, tenantId, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId, nome: `Funil ${sufixo}` } });
    const stage = await tx.stage.create({ data: { tenantId, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId, nome: `Cliente ${sufixo}` } });
    return tx.lead.create({ data: { tenantId, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
  });
}

async function criarBookingDePreco(tenantId: string, leadId: string, preco: number) {
  const p = await criarProposta(prisma, { tenantId, leadId, moeda: "BRL", preco, validade: VALIDADE_FUTURA() });
  await enviarProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  await aceitarProposta(prisma, { tenantId, propostaId: p.id });
  const r = await criarBookingDaProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  if (!r.ok) throw new Error("esperava criação de booking");
  return r.booking;
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (payment teste)", slug: `pay-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (payment teste)", slug: `pay-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `pay-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
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
    await tx.payment.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.gate.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("Payment — criação e idempotência", () => {
  it("cria um Payment PENDENTE vinculado ao booking", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const r = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.criado).toBe(true);
      expect(r.payment.status).toBe("PENDENTE");
    }
  });

  it("idempotencyKey repetida não cria um segundo Payment (dedup pra webhook futuro)", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const r1 = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", idempotencyKey: "evt-123", actorType: "HUMANO", userId: userA.id });
    const r2 = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", idempotencyKey: "evt-123", actorType: "HUMANO", userId: userA.id });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r2.criado).toBe(false);
      expect(r2.payment.id).toBe(r1.payment.id);
    }
  });

  it("PM-CONV-08 — achado real: Payment em moeda diferente da Proposal do Booking é rejeitado (evita soma cross-moeda em sincronizarStatusPagamentoBooking/resumoPagamentoBooking)", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000); // Proposal em BRL
    const r = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "EUR", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("MOEDA_DIVERGENTE");

    const payments = await listarPaymentsDoBooking(prisma, tenantA.id, booking.id);
    expect(payments).toHaveLength(0); // nunca chegou a criar a linha
  });
});

describe("Payment — máquina de estados e sincronização com Booking", () => {
  it("pagamento único confirmado (PAGO) move o Booking pra PAGO", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação");

    const r = await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);

    const bookingAtualizado = await withTenant(prisma, tenantA.id, (tx) => tx.booking.findUniqueOrThrow({ where: { id: booking.id } }));
    expect(bookingAtualizado.status).toBe("PAGO");
  });

  it("parcelamento: primeira parcela paga move pra PAGAMENTO_PARCIAL, segunda completa move pra PAGO", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const parcela1 = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 4000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    const parcela2 = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 6000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!parcela1.ok || !parcela2.ok) throw new Error("esperava criação");

    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: parcela1.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });
    let bookingAtualizado = await withTenant(prisma, tenantA.id, (tx) => tx.booking.findUniqueOrThrow({ where: { id: booking.id } }));
    expect(bookingAtualizado.status).toBe("PAGAMENTO_PARCIAL");

    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: parcela2.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });
    bookingAtualizado = await withTenant(prisma, tenantA.id, (tx) => tx.booking.findUniqueOrThrow({ where: { id: booking.id } }));
    expect(bookingAtualizado.status).toBe("PAGO");
  });

  it("PM-CONV-08 — achado real: parcelas 'quebradas' que somam o valor EXATO (erro de float) movem o Booking pra PAGO mesmo assim", async () => {
    // R$2,55 + R$2,56 = R$5,11 exatos, mas em IEEE754 2.55+2.56 ===
    // 5.109999999999999, não 5.11 — reproduzido e confirmado em Node antes
    // desta correção. Sem a comparação em centavos (`money.ts`), este
    // Booking ficaria PRESO em PAGAMENTO_PARCIAL para sempre, mesmo com o
    // cliente tendo pago o valor exato.
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 5.11);
    const valores = [2.55, 2.56];
    for (const valor of valores) {
      const p = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
      if (!p.ok) throw new Error("esperava criação");
      await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: p.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });
    }
    const bookingFinal = await withTenant(prisma, tenantA.id, (tx) => tx.booking.findUniqueOrThrow({ where: { id: booking.id } }));
    expect(bookingFinal.status).toBe("PAGO");
  });

  it("transição inválida (ex.: PENDENTE direto pra REEMBOLSADO) é rejeitada", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação");

    // @ts-expect-error -- testando deliberadamente um valor fora do subconjunto aceito pela assinatura, pra provar que a validação de runtime também bloqueia
    const r = await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "REEMBOLSADO", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
  });

  it("sincronização de pagamento NUNCA regride um Booking já avançado (ex.: já CONFIRMADA)", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação");
    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });
    await moverBookingStatus(prisma, { tenantId: tenantA.id, bookingId: booking.id, novoStatus: "CONFIRMADA", actorType: "HUMANO", userId: userA.id });

    // registra outro pagamento avulso (ex.: taxa extra) que também fecha PAGO — não deve mexer no booking já CONFIRMADA
    const extra = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!extra.ok) throw new Error("esperava criação");
    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: extra.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });

    const bookingFinal = await withTenant(prisma, tenantA.id, (tx) => tx.booking.findUniqueOrThrow({ where: { id: booking.id } }));
    expect(bookingFinal.status).toBe("CONFIRMADA"); // nunca regrediu
  });
});

describe("Payment — estorno sempre via Gate FINANCEIRO, nunca autoaprovado", () => {
  it("estorno só é permitido a partir de PAGO/PARCIALMENTE_PAGO", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação");

    const r = await solicitarEstornoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, valorEstorno: 1000, motivo: "teste", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("STATUS_NAO_PERMITE_ESTORNO");
  });

  it("valor de estorno maior que o valor pago é rejeitado", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação");
    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });

    const r = await solicitarEstornoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, valorEstorno: 999999, motivo: "teste", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("VALOR_INVALIDO");
  });

  it("solicitação cria Gate FINANCEIRO real; confirmação só aplica depois de aprovado por decisor humano", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação");
    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });

    const solicitacao = await solicitarEstornoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, valorEstorno: 3000, motivo: "cliente cancelou parte do pacote", actorType: "AGENTE", actorLabel: "yalla" });
    expect(solicitacao.ok).toBe(true);
    if (!solicitacao.ok) return;

    const gate = await withTenant(prisma, tenantA.id, (tx) => tx.gate.findUniqueOrThrow({ where: { id: solicitacao.gateId } }));
    expect(gate.categoria).toBe("FINANCEIRO");
    expect(gate.status).toBe("PENDENTE");

    // antes de aprovar: confirmar não muda nada
    const antesDeAprovar = await confirmarEstornoAposAprovacaoGate(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id });
    expect(antesDeAprovar.ok).toBe(true);
    if (antesDeAprovar.ok) expect(antesDeAprovar.status).toBe("GATE_PENDENTE");

    await decidirGate(prisma, { tenantId: tenantA.id, gateId: solicitacao.gateId, decisao: "APROVADO", decisorId: userA.id });
    const depoisDeAprovar = await confirmarEstornoAposAprovacaoGate(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id });
    expect(depoisDeAprovar.ok).toBe(true);
    if (depoisDeAprovar.ok && depoisDeAprovar.status === "PARCIALMENTE_REEMBOLSADO") {
      expect(depoisDeAprovar.jaAplicado).toBe(false);
      expect(depoisDeAprovar.payment.valorEstornado).toBe(3000);
    } else {
      throw new Error("esperava PARCIALMENTE_REEMBOLSADO");
    }
  });

  it("Gate rejeitado nunca aplica o estorno", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação");
    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });

    const solicitacao = await solicitarEstornoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, valorEstorno: 10000, motivo: "teste", actorType: "HUMANO", userId: userA.id });
    if (!solicitacao.ok) throw new Error("esperava sucesso");
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: solicitacao.gateId, decisao: "REJEITADO", decisorId: userA.id });

    const r = await confirmarEstornoAposAprovacaoGate(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("GATE_NEGADO");

    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.payment.findUniqueOrThrow({ where: { id: pagamento.payment.id } }));
    expect(releitura.status).toBe("PAGO"); // nunca mudou
  });

  it("confirmar duas vezes o mesmo Gate aprovado nunca duplica o valor estornado (idempotência real)", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const pagamento = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!pagamento.ok) throw new Error("esperava criação");
    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });

    const solicitacao = await solicitarEstornoPayment(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id, valorEstorno: 5000, motivo: "teste", actorType: "HUMANO", userId: userA.id });
    if (!solicitacao.ok) throw new Error("esperava sucesso");
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: solicitacao.gateId, decisao: "APROVADO", decisorId: userA.id });

    const primeira = await confirmarEstornoAposAprovacaoGate(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id });
    const segunda = await confirmarEstornoAposAprovacaoGate(prisma, { tenantId: tenantA.id, paymentId: pagamento.payment.id });
    expect(primeira.ok && segunda.ok).toBe(true);
    if (segunda.ok && "jaAplicado" in segunda) expect(segunda.jaAplicado).toBe(true);

    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.payment.findUniqueOrThrow({ where: { id: pagamento.payment.id } }));
    expect(releitura.valorEstornado).toBe(5000); // nunca 10000 (não duplicou)
  });
});

describe("Payment — resumo e listagem", () => {
  it("resumoPagamentoBooking soma corretamente pago/pendente e sinaliza quitação", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const parcela1 = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 4000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    const parcela2 = await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 6000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!parcela1.ok || !parcela2.ok) throw new Error("esperava criação");
    await registrarResultadoPayment(prisma, { tenantId: tenantA.id, paymentId: parcela1.payment.id, novoStatus: "PAGO", actorType: "HUMANO", userId: userA.id });

    const resumo = await resumoPagamentoBooking(prisma, tenantA.id, booking.id);
    expect(resumo.totalDevido).toBe(10000);
    expect(resumo.totalPago).toBe(4000);
    expect(resumo.totalPendente).toBe(6000);
    expect(resumo.quitado).toBe(false);

    const payments = await listarPaymentsDoBooking(prisma, tenantA.id, booking.id);
    expect(payments).toHaveLength(2);
  });
});

describe("Payment — isolamento multi-tenant (RLS)", () => {
  it("Tenant B não lista Payment do Tenant A", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    await criarPayment(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });

    const listagemB = await withSystem(prisma, (tx) => tx.payment.findMany({ where: { tenantId: tenantB.id } }));
    expect(listagemB).toHaveLength(0);

    const r = await criarPayment(prisma, { tenantId: tenantB.id, bookingId: booking.id, valor: 10000, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false); // Booking de A não é visível sob RLS do tenant B
  });
});
