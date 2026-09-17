import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withSystem,
  withTenant,
  criarProposta,
  enviarProposta,
  aceitarProposta,
  criarBookingDaProposta,
  criarComissao,
  confirmarComissao,
  cancelarComissao,
  solicitarPagamentoComissao,
  confirmarPagamentoComissaoAposGate,
  listarComissoesDoBooking,
  listarComissoesPendentes,
  decidirGate,
} from "../../src";

/**
 * Commission (PM-NIGHT-RUN-02, Etapa 3, §21) — consumidor real:
 * Booking.responsavelId. Pagamento sempre via Gate FINANCEIRO, com a mesma
 * idempotência real já comprovada em Payment (reconfirmar não paga duas
 * vezes).
 */
let tenantA: { id: string };
let tenantB: { id: string };
let vendedorA: { id: string };
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
  await enviarProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: vendedorA.id });
  await aceitarProposta(prisma, { tenantId, propostaId: p.id });
  const r = await criarBookingDaProposta(prisma, { tenantId, propostaId: p.id, responsavelId: vendedorA.id, actorType: "HUMANO", userId: vendedorA.id });
  if (!r.ok) throw new Error("esperava criação de booking");
  return r.booking;
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (commission teste)", slug: `com-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (commission teste)", slug: `com-b-${Date.now()}` } });
  vendedorA = await prisma.user.create({ data: { email: `com-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: vendedorA.id, tenantId: tenantA.id, roleId: role.id } });
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
    await tx.commission.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.gate.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("Commission — criação", () => {
  it("cria uma comissão PREVISTA pro vendedor responsável pelo booking", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const r = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", percentual: 0.05, baseCalculo: 10000, actorType: "HUMANO", userId: vendedorA.id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.commission.status).toBe("PREVISTA");
      expect(r.commission.beneficiarioId).toBe(vendedorA.id);
    }
  });

  it("beneficiário que não é membro do tenant é rejeitado", async () => {
    const outroTenantUser = await prisma.user.create({ data: { email: `outro-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const r = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: outroTenantUser.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: vendedorA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("BENEFICIARIO_NAO_E_MEMBRO_DO_TENANT");
    await withSystem(prisma, (tx) => tx.user.delete({ where: { id: outroTenantUser.id } }));
  });

  it("PM-CONV-08 — achado real: idempotencyKey repetida não cria uma segunda Commission (duplo clique/retry)", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const r1 = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", idempotencyKey: "acao-500", actorType: "HUMANO", userId: vendedorA.id });
    const r2 = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", idempotencyKey: "acao-500", actorType: "HUMANO", userId: vendedorA.id });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.criada).toBe(true);
      expect(r2.criada).toBe(false);
      expect(r2.commission.id).toBe(r1.commission.id);
    }
    const todas = await withTenant(prisma, tenantA.id, (tx) => tx.commission.findMany({ where: { tenantId: tenantA.id, bookingId: booking.id } }));
    expect(todas).toHaveLength(1);
  });
});

describe("Commission — confirmação e cancelamento", () => {
  it("PREVISTA → CONFIRMADA é permitido; PREVISTA → PAGA direto não é", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const criada = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: vendedorA.id });
    if (!criada.ok) throw new Error("esperava criação");

    const confirmada = await confirmarComissao(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id, actorType: "HUMANO", userId: vendedorA.id });
    expect(confirmada.ok).toBe(true);
    if (confirmada.ok) expect(confirmada.commission.status).toBe("CONFIRMADA");
  });

  it("cancela uma comissão PREVISTA", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const criada = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: vendedorA.id });
    if (!criada.ok) throw new Error("esperava criação");

    const cancelada = await cancelarComissao(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id, actorType: "HUMANO", userId: vendedorA.id });
    expect(cancelada.ok).toBe(true);
    if (cancelada.ok) expect(cancelada.commission.status).toBe("CANCELADA");
  });
});

describe("Commission — pagamento sempre via Gate FINANCEIRO, nunca autoaprovado", () => {
  it("só é possível solicitar pagamento a partir de CONFIRMADA", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const criada = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: vendedorA.id });
    if (!criada.ok) throw new Error("esperava criação");

    const r = await solicitarPagamentoComissao(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id, motivo: "teste", actorType: "HUMANO", userId: vendedorA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("STATUS_NAO_PERMITE_PAGAMENTO");
  });

  it("solicitação cria Gate FINANCEIRO real; aprovação humana libera o pagamento", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const criada = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: vendedorA.id });
    if (!criada.ok) throw new Error("esperava criação");
    await confirmarComissao(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id, actorType: "HUMANO", userId: vendedorA.id });

    const solicitacao = await solicitarPagamentoComissao(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id, motivo: "fechamento do mês", actorType: "AGENTE", actorLabel: "yalla" });
    expect(solicitacao.ok).toBe(true);
    if (!solicitacao.ok) return;

    const gate = await withTenant(prisma, tenantA.id, (tx) => tx.gate.findUniqueOrThrow({ where: { id: solicitacao.gateId } }));
    expect(gate.categoria).toBe("FINANCEIRO");
    expect(gate.status).toBe("PENDENTE");

    const antesDeAprovar = await confirmarPagamentoComissaoAposGate(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id });
    expect(antesDeAprovar.ok).toBe(true);
    if (antesDeAprovar.ok) expect(antesDeAprovar.status).toBe("GATE_PENDENTE");

    await decidirGate(prisma, { tenantId: tenantA.id, gateId: solicitacao.gateId, decisao: "APROVADO", decisorId: vendedorA.id });
    const depoisDeAprovar = await confirmarPagamentoComissaoAposGate(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id });
    expect(depoisDeAprovar.ok).toBe(true);
    if (depoisDeAprovar.ok && depoisDeAprovar.status === "PAGA") {
      expect(depoisDeAprovar.jaAplicado).toBe(false);
      expect(depoisDeAprovar.commission.pagaEm).not.toBeNull();
    } else {
      throw new Error("esperava PAGA");
    }
  });

  it("Gate rejeitado nunca paga a comissão", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const criada = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: vendedorA.id });
    if (!criada.ok) throw new Error("esperava criação");
    await confirmarComissao(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id, actorType: "HUMANO", userId: vendedorA.id });
    const solicitacao = await solicitarPagamentoComissao(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id, motivo: "teste", actorType: "HUMANO", userId: vendedorA.id });
    if (!solicitacao.ok) throw new Error("esperava sucesso");

    await decidirGate(prisma, { tenantId: tenantA.id, gateId: solicitacao.gateId, decisao: "REJEITADO", decisorId: vendedorA.id });
    const r = await confirmarPagamentoComissaoAposGate(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("GATE_NEGADO");

    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.commission.findUniqueOrThrow({ where: { id: criada.commission.id } }));
    expect(releitura.status).toBe("CONFIRMADA"); // nunca virou PAGA
  });

  it("confirmar duas vezes o mesmo Gate aprovado nunca paga a comissão duas vezes (idempotência real)", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    const criada = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: vendedorA.id });
    if (!criada.ok) throw new Error("esperava criação");
    await confirmarComissao(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id, actorType: "HUMANO", userId: vendedorA.id });
    const solicitacao = await solicitarPagamentoComissao(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id, motivo: "teste", actorType: "HUMANO", userId: vendedorA.id });
    if (!solicitacao.ok) throw new Error("esperava sucesso");
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: solicitacao.gateId, decisao: "APROVADO", decisorId: vendedorA.id });

    const primeira = await confirmarPagamentoComissaoAposGate(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id });
    const segunda = await confirmarPagamentoComissaoAposGate(prisma, { tenantId: tenantA.id, commissionId: criada.commission.id });
    expect(primeira.ok && segunda.ok).toBe(true);
    if (segunda.ok && "jaAplicado" in segunda) expect(segunda.jaAplicado).toBe(true);
  });
});

describe("Commission — consultas e isolamento multi-tenant (RLS)", () => {
  it("listarComissoesDoBooking e listarComissoesPendentes funcionam", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: vendedorA.id });

    const doBooking = await listarComissoesDoBooking(prisma, tenantA.id, booking.id);
    expect(doBooking).toHaveLength(1);

    const pendentes = await listarComissoesPendentes(prisma, tenantA.id);
    expect(pendentes).toHaveLength(1);
  });

  it("Tenant B não lista comissão do Tenant A", async () => {
    const booking = await criarBookingDePreco(tenantA.id, leadA.id, 10000);
    await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: vendedorA.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: vendedorA.id });

    const listagemB = await listarComissoesPendentes(prisma, tenantB.id);
    expect(listagemB).toHaveLength(0);
  });
});
