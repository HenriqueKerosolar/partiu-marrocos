import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withSystem,
  withTenant,
  submeterJob,
  criarProposta,
  enviarProposta,
  aceitarProposta,
  criarBookingDaProposta,
  adicionarTraveler,
  criarRequisito,
  moverStatusDocumento,
  listarDocumentosDoTraveler,
} from "@partiumarrocos/db";
import { processarJobAteConcluir } from "../helpers/job-queue";

/**
 * travel_document.verificar_pendencias (PM-NIGHT-RUN-02, Etapa 4, §31) —
 * Job Engine real. Prova negativa central: em nenhum cenário deste
 * arquivo uma `Message` é criada — o job só sinaliza via `Note`, nunca
 * envia WhatsApp/mensagem externa sozinho.
 */
await import("@/lib/jobs"); // registra travel_document.verificar_pendencias
// PM-CONV-06, §5E — mesma razão de job-lead-repescar.test.ts: este arquivo
// participa da fila global de teste, precisa conhecer todos os job types
// em jogo entre os arquivos (ver tests/helpers/register-test-job-types.ts).
await import("../helpers/register-test-job-types");

let tenant: { id: string };
let pipeline: { id: string };
let stage: { id: string };
let contact: { id: string };
let userA: { id: string };

const VALIDADE_FUTURA = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

async function criarBookingComPassageiro(nome: string) {
  const lead = await withTenant(prisma, tenant.id, (tx) => tx.lead.create({ data: { tenantId: tenant.id, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } }));
  const p = await criarProposta(prisma, { tenantId: tenant.id, leadId: lead.id, moeda: "BRL", preco: 5000, validade: VALIDADE_FUTURA() });
  await enviarProposta(prisma, { tenantId: tenant.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  await aceitarProposta(prisma, { tenantId: tenant.id, propostaId: p.id });
  const b = await criarBookingDaProposta(prisma, { tenantId: tenant.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
  if (!b.ok) throw new Error("esperava criação de booking");
  const t = await adicionarTraveler(prisma, { tenantId: tenant.id, bookingId: b.booking.id, nome });
  if (!t.ok) throw new Error("esperava criação de passageiro");
  return { lead, booking: b.booking, traveler: t.traveler };
}

async function rodarJob(travelerId: string) {
  const { job } = await submeterJob(prisma, {
    tenantId: tenant.id,
    type: "travel_document.verificar_pendencias",
    payload: { travelerId },
    source: "teste",
    actorType: "SISTEMA",
  });
  return processarJobAteConcluir(prisma, job.id, tenant.id, "worker-teste-traveldoc");
}

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (job traveldoc teste)", slug: `job-tdoc-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `job-tdoc-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenant.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenant.id, roleId: role.id } });
  });
  await withTenant(prisma, tenant.id, async (tx) => {
    pipeline = await tx.pipeline.create({ data: { tenantId: tenant.id, nome: "Funil teste" } });
    stage = await tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    contact = await tx.contact.create({ data: { tenantId: tenant.id, nome: "Cliente doc" } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenant.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.execution.deleteMany({ where: { tenantId: tenant.id } });
    await tx.job.deleteMany({ where: { tenantId: tenant.id } });
    await tx.note.deleteMany({ where: { tenantId: tenant.id } });
    await tx.travelerDocument.deleteMany({ where: { tenantId: tenant.id } });
    await tx.documentRequirement.deleteMany({ where: { tenantId: tenant.id } });
    await tx.traveler.deleteMany({ where: { tenantId: tenant.id } });
    await tx.booking.deleteMany({ where: { tenantId: tenant.id } });
    await tx.proposal.deleteMany({ where: { tenantId: tenant.id } });
  });
});

describe("travel_document.verificar_pendencias — sinaliza via Note, nunca envia mensagem", () => {
  it("passageiro com documento obrigatório PENDENTE: sinaliza no Lead", async () => {
    await criarRequisito(prisma, { tenantId: tenant.id, nome: "Passaporte válido", obrigatorio: true });
    const { lead, traveler } = await criarBookingComPassageiro("Ana");

    const final = await rodarJob(traveler.id);
    expect(final.status).toBe("SUCCEEDED");

    const nota = await withTenant(prisma, tenant.id, (tx) => tx.note.findFirstOrThrow({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "PENDENCIA" } }));
    expect(nota.conteudo).toContain("Passaporte válido");

    const mensagens = await withTenant(prisma, tenant.id, (tx) => tx.message.findMany({ where: { tenantId: tenant.id } }));
    expect(mensagens).toHaveLength(0); // nunca envia mensagem sozinho
  });

  it("passageiro com documento vencendo em breve: sinaliza no Lead", async () => {
    await criarRequisito(prisma, { tenantId: tenant.id, nome: "Passaporte válido", obrigatorio: true });
    const { lead, traveler } = await criarBookingComPassageiro("Bruno");
    const [doc] = await listarDocumentosDoTraveler(prisma, tenant.id, traveler.id);
    await moverStatusDocumento(prisma, { tenantId: tenant.id, travelerDocumentId: doc!.id, novoStatus: "ENVIADO", actorType: "HUMANO", userId: userA.id });
    await moverStatusDocumento(prisma, { tenantId: tenant.id, travelerDocumentId: doc!.id, novoStatus: "APROVADO", validadeAte: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), actorType: "HUMANO", userId: userA.id });

    const final = await rodarJob(traveler.id);
    expect(final.status).toBe("SUCCEEDED");

    const nota = await withTenant(prisma, tenant.id, (tx) => tx.note.findFirstOrThrow({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "PENDENCIA" } }));
    expect(nota.conteudo).toContain("vencendo");
  });

  it("passageiro com tudo aprovado e válido: não sinaliza nada", async () => {
    await criarRequisito(prisma, { tenantId: tenant.id, nome: "Passaporte válido", obrigatorio: true });
    const { lead, traveler } = await criarBookingComPassageiro("Carla");
    const [doc] = await listarDocumentosDoTraveler(prisma, tenant.id, traveler.id);
    await moverStatusDocumento(prisma, { tenantId: tenant.id, travelerDocumentId: doc!.id, novoStatus: "ENVIADO", actorType: "HUMANO", userId: userA.id });
    await moverStatusDocumento(prisma, { tenantId: tenant.id, travelerDocumentId: doc!.id, novoStatus: "APROVADO", validadeAte: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), actorType: "HUMANO", userId: userA.id });

    const final = await rodarJob(traveler.id);
    expect(final.status).toBe("SUCCEEDED");

    const notas = await withTenant(prisma, tenant.id, (tx) => tx.note.findMany({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "PENDENCIA" } }));
    expect(notas).toHaveLength(0);
  });

  it("reavalia NA HORA de rodar: documento aprovado entre o agendamento e a execução não sinaliza mais", async () => {
    await criarRequisito(prisma, { tenantId: tenant.id, nome: "Passaporte válido", obrigatorio: true });
    const { lead, traveler } = await criarBookingComPassageiro("Duda");
    const [doc] = await listarDocumentosDoTraveler(prisma, tenant.id, traveler.id);

    // aprova ANTES do job rodar — mesmo padrão de reavaliação de repescagem
    await moverStatusDocumento(prisma, { tenantId: tenant.id, travelerDocumentId: doc!.id, novoStatus: "ENVIADO", actorType: "HUMANO", userId: userA.id });
    await moverStatusDocumento(prisma, { tenantId: tenant.id, travelerDocumentId: doc!.id, novoStatus: "APROVADO", validadeAte: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), actorType: "HUMANO", userId: userA.id });

    await rodarJob(traveler.id);
    const notas = await withTenant(prisma, tenant.id, (tx) => tx.note.findMany({ where: { tenantId: tenant.id, leadId: lead.id, tipo: "PENDENCIA" } }));
    expect(notas).toHaveLength(0);
  });
});
