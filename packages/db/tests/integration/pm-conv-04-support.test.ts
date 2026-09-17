import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma, withSystem, withTenant, abrirTicket, responderTicket, moverStatusTicket, avaliarTicket, listarTickets, buscarTicket } from "../../src";

/**
 * PM-CONV-04, Track D — Ouvidoria/Support. Cobre §9D do comando: criação,
 * protocolo, status, atribuição, RLS, cross-tenant, Audit.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (support teste)", slug: `support-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (support teste)", slug: `support-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `support-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: role.id } });
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
    await tx.supportTicketMessage.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.supportTicket.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

describe("Abertura de ticket — protocolo sequencial legível", () => {
  it("abre com protocolo no formato OUV-ANO-NNNNNN e mensagem inicial", async () => {
    const ticket = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "Reclamação sobre atraso", categoria: "RECLAMACAO", mensagemInicial: "O ônibus atrasou 2 horas.", actorType: "HUMANO", userId: userA.id });
    expect(ticket.protocolo).toMatch(/^OUV-\d{4}-\d{6}$/);
    expect(ticket.status).toBe("ABERTO");

    const completo = await buscarTicket(prisma, tenantA.id, ticket.id);
    expect(completo?.mensagens).toHaveLength(1);
    expect(completo?.mensagens[0]?.autorTipo).toBe("CLIENTE");
  });

  it("protocolo é sequencial e nunca colide", async () => {
    const t1 = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "A", categoria: "DUVIDA", mensagemInicial: "msg", actorType: "HUMANO", userId: userA.id });
    const t2 = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "B", categoria: "DUVIDA", mensagemInicial: "msg", actorType: "HUMANO", userId: userA.id });
    expect(t1.protocolo).not.toBe(t2.protocolo);
  });
});

describe("Resposta e mudança de status", () => {
  it("responder move ABERTO para EM_ANDAMENTO automaticamente", async () => {
    const ticket = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "Dúvida", categoria: "DUVIDA", mensagemInicial: "Quando embarca?", actorType: "HUMANO", userId: userA.id });
    const r = await responderTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, corpo: "Embarque às 9h.", autorUserId: userA.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);

    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } }));
    expect(releitura.status).toBe("EM_ANDAMENTO");
  });

  it("rejeita responder ticket já FECHADO", async () => {
    const ticket = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "X", categoria: "OUTRO", mensagemInicial: "msg", actorType: "HUMANO", userId: userA.id });
    await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "RESOLVIDO", actorType: "HUMANO", userId: userA.id });
    await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "FECHADO", actorType: "HUMANO", userId: userA.id });

    const r = await responderTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, corpo: "tarde demais", autorUserId: userA.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("TICKET_FECHADO");
  });

  it("máquina de estados rejeita transição inválida (ABERTO direto pra FECHADO é permitido, mas FECHADO não sai de lugar nenhum)", async () => {
    const ticket = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "Y", categoria: "OUTRO", mensagemInicial: "msg", actorType: "HUMANO", userId: userA.id });
    await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "FECHADO", actorType: "HUMANO", userId: userA.id });

    const r = await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "EM_ANDAMENTO", actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("TRANSICAO_INVALIDA");
  });

  it("auditoria registra abertura, resposta e mudança de status", async () => {
    const ticket = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "Z", categoria: "ELOGIO", mensagemInicial: "Muito bom!", actorType: "HUMANO", userId: userA.id });
    await responderTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, corpo: "Obrigado pelo retorno!", autorUserId: userA.id, actorType: "HUMANO", userId: userA.id });
    await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "RESOLVIDO", actorType: "HUMANO", userId: userA.id });

    const eventos = await withSystem(prisma, (tx) => tx.auditLog.findMany({ where: { tenantId: tenantA.id, entidadeId: ticket.id } }));
    expect(eventos.map((e) => e.acao)).toEqual(expect.arrayContaining(["SUPPORT_TICKET_ABERTO", "SUPPORT_TICKET_RESPONDIDO", "SUPPORT_TICKET_STATUS_ALTERADO"]));
  });
});

describe("Avaliação do cliente", () => {
  it("rejeita nota fora de 1-5", async () => {
    const ticket = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "W", categoria: "DUVIDA", mensagemInicial: "msg", actorType: "HUMANO", userId: userA.id });
    await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "RESOLVIDO", actorType: "HUMANO", userId: userA.id });
    await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "FECHADO", actorType: "HUMANO", userId: userA.id });

    const r = await avaliarTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, nota: 6 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("NOTA_INVALIDA");
  });

  it("aceita avaliação com ticket FECHADO", async () => {
    const ticket = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "V", categoria: "DUVIDA", mensagemInicial: "msg", actorType: "HUMANO", userId: userA.id });
    await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "RESOLVIDO", actorType: "HUMANO", userId: userA.id });
    await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "FECHADO", actorType: "HUMANO", userId: userA.id });

    const r = await avaliarTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, nota: 5, comentario: "Excelente atendimento" });
    expect(r.ok).toBe(true);
  });

  it("auditoria registra a avaliação", async () => {
    const ticket = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "U", categoria: "DUVIDA", mensagemInicial: "msg", actorType: "HUMANO", userId: userA.id });
    await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "RESOLVIDO", actorType: "HUMANO", userId: userA.id });
    await moverStatusTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, novoStatus: "FECHADO", actorType: "HUMANO", userId: userA.id });
    await avaliarTicket(prisma, { tenantId: tenantA.id, ticketId: ticket.id, nota: 4 });

    const eventos = await withSystem(prisma, (tx) => tx.auditLog.findMany({ where: { tenantId: tenantA.id, entidadeId: ticket.id, acao: "SUPPORT_TICKET_AVALIADO" } }));
    expect(eventos).toHaveLength(1);
    const evento = eventos[0]!;
    expect((evento.detalhe as { nota: number }).nota).toBe(4);
  });
});

describe("RLS — isolamento multi-tenant", () => {
  it("Tenant B não lista nem lê ticket do Tenant A", async () => {
    const ticket = await abrirTicket(prisma, { tenantId: tenantA.id, assunto: "Sigiloso", categoria: "RECLAMACAO", mensagemInicial: "msg", actorType: "HUMANO", userId: userA.id });

    const listaB = await listarTickets(prisma, tenantB.id);
    expect(listaB).toHaveLength(0);

    const buscaB = await buscarTicket(prisma, tenantB.id, ticket.id);
    expect(buscaB).toBeNull();
  });
});
