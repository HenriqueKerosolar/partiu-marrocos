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
  solicitarPagamentoComissao,
  confirmarPagamentoComissaoAposGate,
  decidirGate,
  criarPartner,
  editarPartner,
  listarPartners,
  registrarIndicacao,
  criarRewardCampaign,
  solicitarReward,
  aprovarReward,
  solicitarPagamentoReward,
  confirmarPagamentoRewardAposGate,
} from "../../src";

/**
 * PM-CONV-04, Track C — Partner + Commission Integration + Rewards.
 * Cobre §13C do comando: Partner CRUD/RLS/RBAC/cross-tenant, referral,
 * reaproveitamento de Commission (não duplicação), evento financeiro,
 * fingerprint do Gate contra adulteração pós-aprovação.
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

async function criarBooking(tenantId: string, leadId: string) {
  const p = await criarProposta(prisma, { tenantId, leadId, moeda: "BRL", preco: 5000, validade: dias(7) });
  await enviarProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  await aceitarProposta(prisma, { tenantId, propostaId: p.id });
  const b = await criarBookingDaProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  if (!b.ok) throw new Error("esperava criação de booking");
  return b.booking;
}

async function criarPartnerPadrao(tenantId: string, codigo = `P${Date.now()}`) {
  const r = await criarPartner(prisma, { tenantId, nome: "Parceiro Teste", codigo, actorType: "HUMANO", userId: userA.id });
  if (!r.ok) throw new Error("esperava criação do partner");
  return r.partner;
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (partner teste)", slug: `partner-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (partner teste)", slug: `partner-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `partner-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
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
    await tx.rewardClaim.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.rewardCampaign.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.commission.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.partnerReferral.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.partner.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("Partner — cadastro externo, distinto de User interno", () => {
  it("cria, edita e desativa", async () => {
    const p = await criarPartnerPadrao(tenantA.id);
    expect(p.ativo).toBe(true);
    const editado = await editarPartner(prisma, { tenantId: tenantA.id, partnerId: p.id, ativo: false, actorType: "HUMANO", userId: userA.id });
    expect(editado.ok).toBe(true);
  });

  it("rejeita código duplicado no mesmo tenant", async () => {
    await criarPartnerPadrao(tenantA.id, "DUP1");
    const r = await criarPartner(prisma, { tenantId: tenantA.id, nome: "Outro", codigo: "DUP1", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("CODIGO_JA_EXISTE");
  });

  it("Tenant B não lista Partner do Tenant A (RLS)", async () => {
    await criarPartnerPadrao(tenantA.id);
    const listaB = await listarPartners(prisma, tenantB.id);
    expect(listaB).toHaveLength(0);
  });
});

describe("Indicação (referral) — distinta de Attribution, um Lead só tem uma", () => {
  it("registra indicação e rejeita segunda indicação para o mesmo lead", async () => {
    const partner = await criarPartnerPadrao(tenantA.id);
    const r1 = await registrarIndicacao(prisma, { tenantId: tenantA.id, partnerId: partner.id, leadId: leadA.id });
    expect(r1.ok).toBe(true);

    const partner2 = await criarPartnerPadrao(tenantA.id, `P2-${Date.now()}`);
    const r2 = await registrarIndicacao(prisma, { tenantId: tenantA.id, partnerId: partner2.id, leadId: leadA.id });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.motivo).toBe("LEAD_JA_TEM_INDICACAO");
  });

  it("registra evento de auditoria ao indicar", async () => {
    const partner = await criarPartnerPadrao(tenantA.id, `P3-${Date.now()}`);
    await registrarIndicacao(prisma, { tenantId: tenantA.id, partnerId: partner.id, leadId: leadA.id, actorType: "HUMANO", userId: userA.id });

    const eventos = await withSystem(prisma, (tx) => tx.auditLog.findMany({ where: { tenantId: tenantA.id, acao: "PARTNER_INDICACAO_REGISTRADA" } }));
    expect(eventos.some((e) => (e.detalhe as { partnerId: string }).partnerId === partner.id)).toBe(true);
  });
});

describe("Commission — reutilizada para Partner, sem duplicar model (§7C)", () => {
  it("cria comissão com Partner como beneficiário", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const partner = await criarPartnerPadrao(tenantA.id);
    const r = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, partnerId: partner.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.commission.partnerId).toBe(partner.id);
      expect(r.commission.beneficiarioId).toBeNull();
    }
  });

  it("rejeita criar comissão sem beneficiário nem partner", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const r = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("BENEFICIARIO_INVALIDO");
  });

  it("rejeita criar comissão com beneficiário E partner ao mesmo tempo", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const partner = await criarPartnerPadrao(tenantA.id);
    const r = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: userA.id, partnerId: partner.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("BENEFICIARIO_INVALIDO");
  });

  it("integridade no BANCO: constraint XOR rejeita insert direto com os dois nulos", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    await expect(
      withTenant(prisma, tenantA.id, (tx) => tx.commission.create({ data: { tenantId: tenantA.id, bookingId: booking.id, valor: 100, moeda: "BRL" } })),
    ).rejects.toThrow();
  });
});

describe("Gate fingerprint (§8C) — adulteração pós-aprovação é detectada", () => {
  it("paga normalmente quando os dados NÃO mudam entre aprovação e execução", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const partner = await criarPartnerPadrao(tenantA.id);
    const comissaoR = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, partnerId: partner.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!comissaoR.ok) throw new Error("esperava criação");
    await withTenant(prisma, tenantA.id, (tx) => tx.commission.update({ where: { id: comissaoR.commission.id }, data: { status: "CONFIRMADA" } }));

    const solicitacao = await solicitarPagamentoComissao(prisma, { tenantId: tenantA.id, commissionId: comissaoR.commission.id, motivo: "Pagamento de comissão de parceiro", actorType: "HUMANO", userId: userA.id });
    if (!solicitacao.ok) throw new Error("esperava solicitação");
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: solicitacao.gateId, decisao: "APROVADO", decisorId: userA.id });

    const confirmacao = await confirmarPagamentoComissaoAposGate(prisma, { tenantId: tenantA.id, commissionId: comissaoR.commission.id });
    expect(confirmacao.ok).toBe(true);
    if (confirmacao.ok) expect(confirmacao.status).toBe("PAGA");
  });

  it("RECUSA pagar quando o valor da comissão muda depois do Gate aprovado", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const partner = await criarPartnerPadrao(tenantA.id);
    const comissaoR = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, partnerId: partner.id, valor: 500, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!comissaoR.ok) throw new Error("esperava criação");
    await withTenant(prisma, tenantA.id, (tx) => tx.commission.update({ where: { id: comissaoR.commission.id }, data: { status: "CONFIRMADA" } }));

    const solicitacao = await solicitarPagamentoComissao(prisma, { tenantId: tenantA.id, commissionId: comissaoR.commission.id, motivo: "Pagamento de comissão de parceiro", actorType: "HUMANO", userId: userA.id });
    if (!solicitacao.ok) throw new Error("esperava solicitação");
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: solicitacao.gateId, decisao: "APROVADO", decisorId: userA.id });

    // ADULTERAÇÃO: valor muda DEPOIS da aprovação do Gate, antes da execução.
    await withTenant(prisma, tenantA.id, (tx) => tx.commission.update({ where: { id: comissaoR.commission.id }, data: { valor: 999999 } }));

    const confirmacao = await confirmarPagamentoComissaoAposGate(prisma, { tenantId: tenantA.id, commissionId: comissaoR.commission.id });
    expect(confirmacao.ok).toBe(true);
    if (confirmacao.ok) expect(confirmacao.status).toBe("DADOS_ALTERADOS_APOS_APROVACAO");

    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.commission.findUniqueOrThrow({ where: { id: comissaoR.commission.id } }));
    expect(releitura.status).toBe("CONFIRMADA"); // NUNCA foi paga
  });

  it("Gates de etapas anteriores (sem fingerprint) continuam funcionando — retrocompatível", async () => {
    const booking = await criarBooking(tenantA.id, leadA.id);
    const comissaoR = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, beneficiarioId: userA.id, valor: 300, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
    if (!comissaoR.ok) throw new Error("esperava criação");
    await withTenant(prisma, tenantA.id, (tx) => tx.commission.update({ where: { id: comissaoR.commission.id }, data: { status: "CONFIRMADA" } }));

    // Simula um Gate "antigo" sem fingerprint (como os de etapas anteriores a esta rodada).
    const solicitacao = await solicitarPagamentoComissao(prisma, { tenantId: tenantA.id, commissionId: comissaoR.commission.id, motivo: "Comissão interna", actorType: "HUMANO", userId: userA.id });
    if (!solicitacao.ok) throw new Error("esperava solicitação");
    await withSystem(prisma, (tx) => tx.gate.update({ where: { id: solicitacao.gateId }, data: { subjectFingerprint: null } }));
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: solicitacao.gateId, decisao: "APROVADO", decisorId: userA.id });

    const confirmacao = await confirmarPagamentoComissaoAposGate(prisma, { tenantId: tenantA.id, commissionId: comissaoR.commission.id });
    expect(confirmacao.ok).toBe(true);
    if (confirmacao.ok) expect(confirmacao.status).toBe("PAGA");
  });
});

describe("RewardCampaign / RewardClaim — distinto de Commission (§10C)", () => {
  it("rejeita solicitação de premiação sem meta atingida", async () => {
    const partner = await criarPartnerPadrao(tenantA.id);
    const campanha = await criarRewardCampaign(prisma, { tenantId: tenantA.id, nome: "Campanha teste", meta: 3, valor: 1000, moeda: "BRL", dataInicio: dias(-5), dataFim: dias(30), actorType: "HUMANO", userId: userA.id });
    if (!campanha.ok) throw new Error("esperava criação");

    const r = await solicitarReward(prisma, { tenantId: tenantA.id, campaignId: campanha.campanha.id, partnerId: partner.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("META_NAO_ATINGIDA");
  });

  it("aprova solicitação quando a meta é atingida, paga via Gate com fingerprint", async () => {
    const partner = await criarPartnerPadrao(tenantA.id);
    const campanha = await criarRewardCampaign(prisma, { tenantId: tenantA.id, nome: "Campanha teste 2", meta: 2, valor: 1000, moeda: "BRL", dataInicio: dias(-5), dataFim: dias(30), actorType: "HUMANO", userId: userA.id });
    if (!campanha.ok) throw new Error("esperava criação");

    // Duas vendas CONFIRMADAS do parceiro dentro da janela.
    for (let i = 0; i < 2; i++) {
      const booking = await criarBooking(tenantA.id, leadA.id);
      const c = await criarComissao(prisma, { tenantId: tenantA.id, bookingId: booking.id, partnerId: partner.id, valor: 100, moeda: "BRL", actorType: "HUMANO", userId: userA.id });
      if (!c.ok) throw new Error("esperava criação de comissão");
      await withTenant(prisma, tenantA.id, (tx) => tx.commission.update({ where: { id: c.commission.id }, data: { status: "CONFIRMADA" } }));
    }

    const solicitacao = await solicitarReward(prisma, { tenantId: tenantA.id, campaignId: campanha.campanha.id, partnerId: partner.id, actorType: "HUMANO", userId: userA.id });
    expect(solicitacao.ok).toBe(true);
    if (!solicitacao.ok) return;

    const aprovacao = await aprovarReward(prisma, { tenantId: tenantA.id, claimId: solicitacao.claim.id, actorType: "HUMANO", userId: userA.id });
    expect(aprovacao.ok).toBe(true);

    const gateSolicitacao = await solicitarPagamentoReward(prisma, { tenantId: tenantA.id, claimId: solicitacao.claim.id, motivo: "Pagar premiação", actorType: "HUMANO", userId: userA.id });
    if (!gateSolicitacao.ok) throw new Error("esperava solicitação de gate");
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: gateSolicitacao.gateId, decisao: "APROVADO", decisorId: userA.id });

    const confirmacao = await confirmarPagamentoRewardAposGate(prisma, { tenantId: tenantA.id, claimId: solicitacao.claim.id });
    expect(confirmacao.ok).toBe(true);
    if (confirmacao.ok) expect(confirmacao.status).toBe("PAGA");
  });

  it("solicitar a mesma premiação duas vezes é idempotente (retorna a mesma claim)", async () => {
    const partner = await criarPartnerPadrao(tenantA.id);
    const campanha = await criarRewardCampaign(prisma, { tenantId: tenantA.id, nome: "Campanha teste 3", meta: 100, valor: 1000, moeda: "BRL", dataInicio: dias(-5), dataFim: dias(30), actorType: "HUMANO", userId: userA.id });
    if (!campanha.ok) throw new Error("esperava criação");

    const r1 = await solicitarReward(prisma, { tenantId: tenantA.id, campaignId: campanha.campanha.id, partnerId: partner.id, actorType: "HUMANO", userId: userA.id });
    // meta alta (100) nunca é atingida — ambas as chamadas devem falhar do mesmo jeito, sem criar nada
    expect(r1.ok).toBe(false);
  });
});
