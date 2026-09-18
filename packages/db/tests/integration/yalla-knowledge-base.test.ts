import { PrismaClient, Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { withSystem, withTenant } from "../../src/tenant-db";
import { executarTool, concederCapability } from "../../src/tools";
import { criarTrip } from "../../src/trip";
import { criarTourVehicle } from "../../src/tour-vehicle";
import { criarTripGroup } from "../../src/trip-group";

/**
 * Base de Conhecimento da Yalla — `conhecimento.consultar` (router entre
 * resposta fixa e tool dinâmica), `viagem.proxima_atividade` (horário real,
 * nunca status) e `viagem.localizacao_veiculo` (GPS com staleness). Mesma
 * estrutura de fixture de pm-conv-05d-viagem-tool.test.ts.
 */
const prisma = new PrismaClient();

let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };
let contactA: { id: string };
let leadA: { id: string };
let leadB: { id: string };
let conversationA: { id: string };

async function montarPipelineELead(tenantId: string, sufixo: string) {
  return withTenant(prisma, tenantId, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId, nome: `Funil teste KB ${sufixo}` } });
    const stage = await tx.stage.create({ data: { tenantId, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId, nome: `Cliente KB Teste ${sufixo}` } });
    const lead = await tx.lead.create({ data: { tenantId, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
    const conversation = await tx.conversation.create({ data: { tenantId, contactId: contact.id, channel: "WEBCHAT" } });
    return { contact, lead, conversation };
  });
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (KB teste)", slug: `kb-tool-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (KB teste)", slug: `kb-tool-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `kb-tool-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  const { contact, lead, conversation } = await montarPipelineELead(tenantA.id, "A");
  contactA = contact;
  leadA = lead;
  conversationA = conversation;
  const { lead: leadBCriado } = await montarPipelineELead(tenantB.id, "B");
  leadB = leadBCriado;

  for (const capability of ["conhecimento.consultar", "viagem.proxima_atividade", "viagem.localizacao_veiculo"]) {
    await concederCapability(prisma, { tenantId: tenantA.id, agent: "yalla", capability, actorType: "SISTEMA" });
  }
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantA.id } }));
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantB.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.geolocationPing.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.trackingSession.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tripGroupProfissional.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.professional.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.booking.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tripActivity.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tripItineraryDay.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.trip.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.tourVehicle.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.proposal.deleteMany({ where: { tenantId: tenantA.id } });
    await tx.knowledgeEntry.deleteMany({ where: { tenantId: tenantA.id } });
  });
});

function ctxYalla(leadId = leadA.id) {
  return { tenantId: tenantA.id, agent: "yalla" as const, actorType: "AGENTE" as const, actorLabel: "yalla", conversationId: conversationA.id, contactId: contactA.id, leadId };
}

async function criarEntradaKB(overrides: Partial<Prisma.KnowledgeEntryUncheckedCreateInput> = {}) {
  const data: Prisma.KnowledgeEntryUncheckedCreateInput = {
    tenantId: tenantA.id,
    categoria: "dinheiro",
    intencao: `moeda_teste_${Date.now()}`,
    answerType: "STATIC_KNOWLEDGE",
    pergunta: "Qual é a moeda oficial do Marrocos?",
    variantes: ["O que é o dirham?"],
    keywords: ["moeda", "dirham"],
    respostaBase: "A moeda oficial é o dirham marroquino.",
    ...overrides,
  };
  return withTenant(prisma, tenantA.id, (tx) => tx.knowledgeEntry.create({ data }));
}

describe("conhecimento.consultar — match e roteamento", () => {
  it("encontra STATIC_KNOWLEDGE por palavra-chave e devolve respostaBase", async () => {
    await criarEntradaKB();
    const r = await executarTool(prisma, ctxYalla(), { toolId: "conhecimento.consultar", toolCallId: `tc-${Date.now()}`, input: { pergunta: "qual a moeda do marrocos" } });
    expect(r.status).toBe("SUCCESS");
    const out = r.data as { encontrado: boolean; resposta: { respostaBase: string | null; answerType: string } | null };
    expect(out.encontrado).toBe(true);
    expect(out.resposta?.answerType).toBe("STATIC_KNOWLEDGE");
    expect(out.resposta?.respostaBase).toContain("dirham");
  });

  it("para entrada TRIP_DYNAMIC, devolve requerTool=true e respostaBase=null, nunca uma resposta fixa", async () => {
    await criarEntradaKB({
      categoria: "roteiro",
      intencao: `horario_teste_${Date.now()}`,
      answerType: "TRIP_DYNAMIC",
      pergunta: "Que horas saímos amanhã?",
      variantes: ["Qual o horário da próxima atividade?"],
      keywords: ["horas", "horario", "saida"],
      respostaBase: null,
      requerTool: true,
      toolId: "viagem.proxima_atividade",
    });
    const r = await executarTool(prisma, ctxYalla(), { toolId: "conhecimento.consultar", toolCallId: `tc-${Date.now()}`, input: { pergunta: "que horas saímos amanhã" } });
    expect(r.status).toBe("SUCCESS");
    const out = r.data as { encontrado: boolean; resposta: { respostaBase: string | null; requerTool: boolean; toolIdSugerido: string | null } | null };
    expect(out.encontrado).toBe(true);
    expect(out.resposta?.respostaBase).toBeNull();
    expect(out.resposta?.requerTool).toBe(true);
    expect(out.resposta?.toolIdSugerido).toBe("viagem.proxima_atividade");
  });

  it("pergunta sem nenhum match devolve encontrado=false, nunca inventa", async () => {
    await criarEntradaKB();
    const r = await executarTool(prisma, ctxYalla(), { toolId: "conhecimento.consultar", toolCallId: `tc-${Date.now()}`, input: { pergunta: "qual a capital da frança e a velocidade do vento hoje" } });
    expect(r.status).toBe("SUCCESS");
    expect((r.data as { encontrado: boolean }).encontrado).toBe(false);
  });

  it("só devolve entries do próprio tenant — entry do Tenant B nunca aparece pro Tenant A", async () => {
    await withTenant(prisma, tenantB.id, (tx) =>
      tx.knowledgeEntry.create({
        data: {
          tenantId: tenantB.id,
          categoria: "dinheiro",
          intencao: `moeda_tenant_b_${Date.now()}`,
          answerType: "STATIC_KNOWLEDGE",
          pergunta: "Qual é a moeda oficial do Marrocos?",
          variantes: [],
          keywords: ["moeda", "dirham"],
          respostaBase: "RESPOSTA EXCLUSIVA DO TENANT B — nunca deveria vazar pro Tenant A.",
        },
      }),
    );
    const r = await executarTool(prisma, ctxYalla(), { toolId: "conhecimento.consultar", toolCallId: `tc-${Date.now()}`, input: { pergunta: "qual a moeda do marrocos" } });
    expect(r.status).toBe("SUCCESS");
    const out = r.data as { encontrado: boolean };
    expect(out.encontrado).toBe(false); // Tenant A não tem entrada própria nesta rodada de teste
  });
});

describe("viagem.proxima_atividade — horário real, nunca inventado", () => {
  it("devolve temProxima=false quando o lead não tem trip vinculada", async () => {
    const r = await executarTool(prisma, ctxYalla(), { toolId: "viagem.proxima_atividade", toolCallId: `tc-${Date.now()}`, input: {} });
    expect(r.status).toBe("SUCCESS");
    expect((r.data as { temProxima: boolean }).temProxima).toBe(false);
  });

  it("devolve a próxima atividade cujo horário ainda não passou, no timezone da trip", async () => {
    const trip = await criarTrip(prisma, {
      tenantId: tenantA.id,
      roteiro: "Marrocos Teste Horário",
      dataInicio: new Date(Date.now() + 24 * 60 * 60 * 1000),
      dataFim: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      timezone: "Africa/Casablanca",
      actorType: "HUMANO",
      userId: userA.id,
    });

    // Dias bem separados (ontem vs. daqui a 3 dias) — evita qualquer
    // ambiguidade de fuso horário na fronteira entre "passado"/"futuro".
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const emTresDias = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const diaPassado = await withTenant(prisma, tenantA.id, (tx) =>
      tx.tripItineraryDay.create({ data: { tenantId: tenantA.id, tripId: trip.id, numeroDia: 1, data: ontem, titulo: "Chegada" } }),
    );
    const diaFuturo = await withTenant(prisma, tenantA.id, (tx) =>
      tx.tripItineraryDay.create({ data: { tenantId: tenantA.id, tripId: trip.id, numeroDia: 2, data: emTresDias, titulo: "Passeio" } }),
    );
    await withTenant(prisma, tenantA.id, (tx) =>
      tx.tripActivity.create({ data: { tenantId: tenantA.id, itineraryDayId: diaPassado.id, nome: "Atividade passada (não deve aparecer)", horaInicio: "12:00", visivelParaViajante: true } }),
    );
    await withTenant(prisma, tenantA.id, (tx) =>
      tx.tripActivity.create({ data: { tenantId: tenantA.id, itineraryDayId: diaFuturo.id, nome: "Passeio pelo souk", local: "Marrakech", horaInicio: "12:00", visivelParaViajante: true } }),
    );
    await withTenant(prisma, tenantA.id, (tx) =>
      tx.tripActivity.create({ data: { tenantId: tenantA.id, itineraryDayId: diaFuturo.id, nome: "Atividade oculta (não deve aparecer)", horaInicio: "11:00", visivelParaViajante: false } }),
    );

    const proposta = await withTenant(prisma, tenantA.id, (tx) =>
      tx.proposal.create({ data: { tenantId: tenantA.id, leadId: leadA.id, status: "ACEITA", versao: 1, moeda: "BRL", preco: 5000, validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }),
    );
    await withTenant(prisma, tenantA.id, (tx) => tx.booking.create({ data: { tenantId: tenantA.id, proposalId: proposta.id, leadId: leadA.id, tripId: trip.id } }));

    const r = await executarTool(prisma, ctxYalla(), { toolId: "viagem.proxima_atividade", toolCallId: `tc-${Date.now()}`, input: {} });
    expect(r.status).toBe("SUCCESS");
    const out = r.data as { temProxima: boolean; atividade: { nome: string } | null };
    expect(out.temProxima).toBe(true);
    expect(out.atividade?.nome).toBe("Passeio pelo souk");
  });

  it("isolamento: lead de outro tenant nunca vaza atividade", async () => {
    const r = await executarTool(prisma, { ...ctxYalla(), tenantId: tenantA.id, leadId: leadB.id }, { toolId: "viagem.proxima_atividade", toolCallId: `tc-${Date.now()}`, input: {} });
    // leadB pertence ao tenantB — resolvido dentro do ctx.tenantId (tenantA), então nunca encontra nada do tenantB.
    expect(r.status).toBe("SUCCESS");
    expect((r.data as { temProxima: boolean }).temProxima).toBe(false);
  });
});

describe("viagem.localizacao_veiculo — GPS com staleness", () => {
  async function montarGrupoComProfissional() {
    const trip = await criarTrip(prisma, {
      tenantId: tenantA.id,
      roteiro: "Marrocos Teste GPS",
      dataInicio: new Date(Date.now() + 24 * 60 * 60 * 1000),
      dataFim: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      timezone: "Africa/Casablanca",
      actorType: "HUMANO",
      userId: userA.id,
    });
    const veiculoR = await criarTourVehicle(prisma, { tenantId: tenantA.id, nome: `Van GPS Teste ${Date.now()}`, capacidade: 10, actorType: "HUMANO", userId: userA.id });
    if (!veiculoR.ok) throw new Error("esperava criação do veículo");
    const grupoR = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Grupo GPS Teste", veiculoId: veiculoR.veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!grupoR.ok) throw new Error("esperava criação do grupo");

    const profissional = await withTenant(prisma, tenantA.id, (tx) => tx.professional.create({ data: { tenantId: tenantA.id, nome: "Guia Teste GPS" } }));
    await withTenant(prisma, tenantA.id, (tx) =>
      tx.tripGroupProfissional.create({ data: { tenantId: tenantA.id, tripGroupId: grupoR.grupo.id, professionalId: profissional.id, papel: "GUIA" } }),
    );

    const proposta = await withTenant(prisma, tenantA.id, (tx) =>
      tx.proposal.create({ data: { tenantId: tenantA.id, leadId: leadA.id, status: "ACEITA", versao: 1, moeda: "BRL", preco: 5000, validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }),
    );
    await withTenant(prisma, tenantA.id, (tx) => tx.booking.create({ data: { tenantId: tenantA.id, proposalId: proposta.id, leadId: leadA.id, tripId: trip.id, tripGroupId: grupoR.grupo.id } }));

    const sessao = await withTenant(prisma, tenantA.id, (tx) =>
      tx.trackingSession.create({ data: { tenantId: tenantA.id, tripGroupId: grupoR.grupo.id, professionalId: profissional.id, status: "ATIVA" } }),
    );
    return { grupoId: grupoR.grupo.id, sessaoId: sessao.id };
  }

  it("posição recente (< limiar) é devolvida como disponível", async () => {
    const { sessaoId } = await montarGrupoComProfissional();
    await withTenant(prisma, tenantA.id, (tx) =>
      tx.geolocationPing.create({ data: { tenantId: tenantA.id, trackingSessionId: sessaoId, latitude: 31.6295, longitude: -7.9811, source: "GPS", capturedAt: new Date() } }),
    );

    const r = await executarTool(prisma, ctxYalla(), { toolId: "viagem.localizacao_veiculo", toolCallId: `tc-${Date.now()}`, input: {} });
    expect(r.status).toBe("SUCCESS");
    const out = r.data as { disponivel: boolean; motivo: string; posicao: { latitude: number } | null };
    expect(out.disponivel).toBe(true);
    expect(out.motivo).toBe("OK");
    expect(out.posicao?.latitude).toBeCloseTo(31.6295);
  });

  it("posição mais antiga que o limiar de staleness é recusada (POSICAO_DESATUALIZADA)", async () => {
    const { sessaoId } = await montarGrupoComProfissional();
    await withTenant(prisma, tenantA.id, (tx) =>
      tx.geolocationPing.create({
        data: { tenantId: tenantA.id, trackingSessionId: sessaoId, latitude: 31.6295, longitude: -7.9811, source: "GPS", capturedAt: new Date(Date.now() - 20 * 60 * 1000) },
      }),
    );

    const r = await executarTool(prisma, ctxYalla(), { toolId: "viagem.localizacao_veiculo", toolCallId: `tc-${Date.now()}`, input: {} });
    expect(r.status).toBe("SUCCESS");
    const out = r.data as { disponivel: boolean; motivo: string; posicao: unknown };
    expect(out.disponivel).toBe(false);
    expect(out.motivo).toBe("POSICAO_DESATUALIZADA");
    expect(out.posicao).toBeNull();
  });

  it("sem sessão ATIVA no grupo, devolve SEM_SESSAO_ATIVA", async () => {
    const trip = await criarTrip(prisma, {
      tenantId: tenantA.id,
      roteiro: "Marrocos Teste GPS Sem Sessão",
      dataInicio: new Date(Date.now() + 24 * 60 * 60 * 1000),
      dataFim: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      timezone: "Africa/Casablanca",
      actorType: "HUMANO",
      userId: userA.id,
    });
    const veiculoR = await criarTourVehicle(prisma, { tenantId: tenantA.id, nome: `Van Sem Sessão ${Date.now()}`, capacidade: 10, actorType: "HUMANO", userId: userA.id });
    if (!veiculoR.ok) throw new Error("esperava criação do veículo");
    const grupoR = await criarTripGroup(prisma, { tenantId: tenantA.id, tripId: trip.id, nome: "Grupo Sem Sessão", veiculoId: veiculoR.veiculo.id, actorType: "HUMANO", userId: userA.id });
    if (!grupoR.ok) throw new Error("esperava criação do grupo");
    const proposta = await withTenant(prisma, tenantA.id, (tx) =>
      tx.proposal.create({ data: { tenantId: tenantA.id, leadId: leadA.id, status: "ACEITA", versao: 1, moeda: "BRL", preco: 5000, validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }),
    );
    await withTenant(prisma, tenantA.id, (tx) => tx.booking.create({ data: { tenantId: tenantA.id, proposalId: proposta.id, leadId: leadA.id, tripId: trip.id, tripGroupId: grupoR.grupo.id } }));

    const r = await executarTool(prisma, ctxYalla(), { toolId: "viagem.localizacao_veiculo", toolCallId: `tc-${Date.now()}`, input: {} });
    expect(r.status).toBe("SUCCESS");
    const out = r.data as { disponivel: boolean; motivo: string };
    expect(out.disponivel).toBe(false);
    expect(out.motivo).toBe("SEM_SESSAO_ATIVA");
  });

  it("lead sem tripGroupId associado devolve SEM_RESERVA_ATIVA", async () => {
    const r = await executarTool(prisma, ctxYalla(), { toolId: "viagem.localizacao_veiculo", toolCallId: `tc-${Date.now()}`, input: {} });
    expect(r.status).toBe("SUCCESS");
    expect((r.data as { motivo: string }).motivo).toBe("SEM_RESERVA_ATIVA");
  });
});

describe("privacidade/IDOR — mesma garantia estrutural do Tool Broker, aplicada às tools novas", () => {
  it("input com campos arbitrários não tem efeito — resolução sempre vem de ctx", async () => {
    await criarEntradaKB();
    const r = await executarTool(prisma, ctxYalla(), {
      toolId: "conhecimento.consultar",
      toolCallId: `tc-${Date.now()}`,
      input: { pergunta: "qual a moeda", tenantId: "outro-tenant", leadId: "outro-lead" },
    });
    expect(r.status).toBe("SUCCESS");
  });

  it("sem grant concedido, as três tools novas são FORBIDDEN", async () => {
    const tenantSemGrant = await prisma.tenant.create({ data: { nome: "Tenant sem grant KB", slug: `kb-sem-grant-${Date.now()}` } });
    try {
      const { lead, contact, conversation } = await montarPipelineELead(tenantSemGrant.id, "SemGrant");
      const ctxSemGrant = { tenantId: tenantSemGrant.id, agent: "yalla" as const, actorType: "AGENTE" as const, conversationId: conversation.id, contactId: contact.id, leadId: lead.id };
      for (const toolId of ["conhecimento.consultar", "viagem.proxima_atividade", "viagem.localizacao_veiculo"]) {
        const input = toolId === "conhecimento.consultar" ? { pergunta: "teste" } : {};
        const r = await executarTool(prisma, ctxSemGrant, { toolId, toolCallId: `tc-${Date.now()}-${toolId}`, input });
        expect(r.status).toBe("FORBIDDEN");
      }
    } finally {
      await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantSemGrant.id } }));
    }
  });
});
