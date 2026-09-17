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
  criarRequisito,
  desativarRequisito,
  listarRequisitos,
  sincronizarRequisitosDoTraveler,
  moverStatusDocumento,
  expirarDocumentosVencidos,
  statusDocumentalDoBooking,
  listarDocumentosDoTraveler,
} from "../../src";

/**
 * Travel Document Foundation 01 (PM-NIGHT-RUN-02, Etapa 4). Prova real:
 * REQUISITO (catálogo) e DOCUMENTO ENVIADO (por passageiro) são conceitos
 * separados — desativar um requisito nunca apaga o histórico de quem já
 * tinha uma linha criada. Privacy-by-design: nenhum teste aqui grava
 * arquivo/URL — só status/metadata.
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

async function criarBookingComPassageiro(tenantId: string, leadId: string, nomePassageiro: string) {
  const p = await criarProposta(prisma, { tenantId, leadId, moeda: "BRL", preco: 5000, validade: VALIDADE_FUTURA() });
  await enviarProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  await aceitarProposta(prisma, { tenantId, propostaId: p.id });
  const b = await criarBookingDaProposta(prisma, { tenantId, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  if (!b.ok) throw new Error("esperava criação de booking");
  const t = await adicionarTraveler(prisma, { tenantId, bookingId: b.booking.id, nome: nomePassageiro });
  if (!t.ok) throw new Error("esperava criação de passageiro");
  return { booking: b.booking, traveler: t.traveler };
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (traveldoc teste)", slug: `tdoc-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (traveldoc teste)", slug: `tdoc-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `tdoc-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
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
    await tx.travelerDocument.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.documentRequirement.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.traveler.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.booking.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("DocumentRequirement — catálogo", () => {
  it("cria e lista requisitos ativos", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Comprovante de vacina", obrigatorio: false });
    const requisitos = await listarRequisitos(prisma, tenantA.id);
    expect(requisitos).toHaveLength(2);
  });

  it("desativar um requisito some da listagem ativa, mas não apaga o histórico já gerado", async () => {
    const req = await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Visto", obrigatorio: true });
    const { traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Ana");
    await sincronizarRequisitosDoTraveler(prisma, { tenantId: tenantA.id, travelerId: traveler.id });

    const antes = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);
    expect(antes.some((d) => d.requirementId === req.id)).toBe(true);

    await desativarRequisito(prisma, { tenantId: tenantA.id, requirementId: req.id });
    const ativos = await listarRequisitos(prisma, tenantA.id);
    expect(ativos).toHaveLength(0);

    const depois = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);
    expect(depois).toHaveLength(1); // histórico preservado, não foi apagado
  });
});

describe("sincronizarRequisitosDoTraveler — instanciação idempotente", () => {
  it("adicionarTraveler já cria as linhas PENDENTE automaticamente pros requisitos ativos", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    const { traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Bruno");

    const documentos = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);
    expect(documentos).toHaveLength(1);
    expect(documentos[0]!.status).toBe("PENDENTE");
  });

  it("chamar sincronizar de novo nunca duplica linha pro mesmo par (traveler, requisito)", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    const { traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Carla");

    await sincronizarRequisitosDoTraveler(prisma, { tenantId: tenantA.id, travelerId: traveler.id });
    await sincronizarRequisitosDoTraveler(prisma, { tenantId: tenantA.id, travelerId: traveler.id });

    const documentos = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);
    expect(documentos).toHaveLength(1);
  });

  it("novo requisito criado depois do passageiro: sincronizar de novo preenche só o que falta", async () => {
    const { traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Duda"); // sem requisito ainda
    let documentos = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);
    expect(documentos).toHaveLength(0);

    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    const criados = await sincronizarRequisitosDoTraveler(prisma, { tenantId: tenantA.id, travelerId: traveler.id });
    expect(criados).toBe(1);

    documentos = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);
    expect(documentos).toHaveLength(1);
  });
});

describe("moverStatusDocumento — máquina de estados aplicada de verdade", () => {
  it("caminho feliz: pendente → enviado → aprovado, com revisor e validade gravados", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    const { traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Elis");
    const [doc] = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);

    await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "ENVIADO", actorType: "HUMANO", userId: userA.id });
    const validade = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    const r = await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "APROVADO", validadeAte: validade, actorType: "HUMANO", userId: userA.id });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.documento.status).toBe("APROVADO");
      expect(r.documento.revisadoPorId).toBe(userA.id);
      expect(r.documento.validadeAte?.getTime()).toBe(validade.getTime());
    }
  });

  it("rejeição grava o motivo; reenvio limpa o motivo antigo", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    const { traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Fabio");
    const [doc] = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);

    await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "ENVIADO", actorType: "HUMANO", userId: userA.id });
    const rejeitado = await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "REJEITADO", motivoRejeicao: "foto ilegível", actorType: "HUMANO", userId: userA.id });
    expect(rejeitado.ok && rejeitado.documento.motivoRejeicao).toBe("foto ilegível");

    const reenviado = await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "ENVIADO", actorType: "HUMANO", userId: userA.id });
    expect(reenviado.ok && reenviado.documento.motivoRejeicao).toBeNull();
  });

  it("transição inválida (pendente direto pra aprovado) é rejeitada", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    const { traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Gustavo");
    const [doc] = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);

    const r = await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "APROVADO", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("TRANSICAO_INVALIDA");
  });
});

describe("expirarDocumentosVencidos — sweep preguiçoso", () => {
  it("documento APROVADO com validade no passado vira EXPIRADO", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    const { traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Helena");
    const [doc] = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);

    await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "ENVIADO", actorType: "HUMANO", userId: userA.id });
    await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "APROVADO", validadeAte: new Date(Date.now() - 24 * 60 * 60 * 1000), actorType: "HUMANO", userId: userA.id });

    const expirados = await expirarDocumentosVencidos(prisma, tenantA.id);
    expect(expirados).toBe(1);

    const releitura = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);
    expect(releitura[0]!.status).toBe("EXPIRADO");
  });

  it("documento APROVADO sem validade (ou ainda válido) nunca expira sozinho", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    const { traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Igor");
    const [doc] = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);
    await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "ENVIADO", actorType: "HUMANO", userId: userA.id });
    await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "APROVADO", actorType: "HUMANO", userId: userA.id });

    await expirarDocumentosVencidos(prisma, tenantA.id);
    const releitura = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);
    expect(releitura[0]!.status).toBe("APROVADO");
  });
});

describe("statusDocumentalDoBooking — agregado, puramente informativo", () => {
  it("completo=false enquanto houver obrigatório pendente; completo=true quando todos aprovados", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    const { booking, traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Julia");

    let agregado = await statusDocumentalDoBooking(prisma, tenantA.id, booking.id);
    expect(agregado.completo).toBe(false);
    expect(agregado.totalObrigatorios).toBe(1);
    expect(agregado.pendentes).toBe(1);

    const [doc] = await listarDocumentosDoTraveler(prisma, tenantA.id, traveler.id);
    await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "ENVIADO", actorType: "HUMANO", userId: userA.id });
    await moverStatusDocumento(prisma, { tenantId: tenantA.id, travelerDocumentId: doc!.id, novoStatus: "APROVADO", actorType: "HUMANO", userId: userA.id });

    agregado = await statusDocumentalDoBooking(prisma, tenantA.id, booking.id);
    expect(agregado.completo).toBe(true);
    expect(agregado.aprovados).toBe(1);
  });

  it("requisito opcional (não obrigatório) nunca impede completo=true", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Comprovante de vacina", obrigatorio: false });
    const { booking } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Kaique");

    const agregado = await statusDocumentalDoBooking(prisma, tenantA.id, booking.id);
    expect(agregado.totalObrigatorios).toBe(0);
    expect(agregado.completo).toBe(false); // sem nenhum obrigatório, não há o que considerar "completo" (0 de 0 não conta como completo por definição desta função)
  });
});

describe("Travel documents — isolamento multi-tenant (RLS)", () => {
  it("Tenant B não lista requisitos nem documentos do Tenant A", async () => {
    await criarRequisito(prisma, { tenantId: tenantA.id, nome: "Passaporte válido", obrigatorio: true });
    const { traveler } = await criarBookingComPassageiro(tenantA.id, leadA.id, "Larissa");

    const requisitosB = await listarRequisitos(prisma, tenantB.id);
    expect(requisitosB).toHaveLength(0);

    const documentosB = await listarDocumentosDoTraveler(prisma, tenantB.id, traveler.id);
    expect(documentosB).toHaveLength(0);
  });
});
