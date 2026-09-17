import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, withSystem, withTenant, criarGate, decidirGate, listarGatesPendentes } from "../../src";

/**
 * T1 — Gates/Approval + Audit Log. Testes negativos reais (não "não vi
 * vazar" — "tentei ativamente vazar/burlar e falhou"), mesmo critério de
 * aceite já usado em tenant-isolation.test.ts/whatsapp-isolation.test.ts.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string }; // membro de A
let userB: { id: string }; // membro de B

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (gates teste)", slug: `gt-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (gates teste)", slug: `gt-b-${Date.now()}` } });

  userA = await prisma.user.create({ data: { email: `gates-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  userB = await prisma.user.create({ data: { email: `gates-b-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });

  await withSystem(prisma, async (tx) => {
    const roleA = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    const roleB = await tx.role.create({ data: { tenantId: tenantB.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: roleA.id } });
    await tx.membership.create({ data: { userId: userB.id, tenantId: tenantB.id, roleId: roleB.id } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } });
    await tx.tenant.delete({ where: { id: tenantB.id } });
    await tx.user.delete({ where: { id: userA.id } });
    await tx.user.delete({ where: { id: userB.id } });
  });
  await prisma.$disconnect();
}, 30000);

describe("Gates — isolamento multi-tenant (RLS)", () => {
  it("Tenant B não lista o Gate do Tenant A", async () => {
    await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "Dar 20% de desconto",
      motivo: "Cliente pediu",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });

    const pendentesB = await listarGatesPendentes(prisma, tenantB.id);
    expect(pendentesB).toHaveLength(0);
  });

  it("Tenant B não lê o Gate do Tenant A por id direto", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "FINANCEIRO",
      acaoProposta: "Estornar pagamento",
      motivo: "Teste de isolamento",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });

    const lido = await withTenant(prisma, tenantB.id, (tx) => tx.gate.findUnique({ where: { id: gate.id } }));
    expect(lido).toBeNull();
  });

  it("Tenant B não consegue decidir o Gate do Tenant A (nem soubesse o id)", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "ACAO_IRREVERSIVEL",
      acaoProposta: "Cancelar reserva",
      motivo: "Teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });

    const resultado = await decidirGate(prisma, { tenantId: tenantB.id, gateId: gate.id, decisao: "APROVADO", decisorId: userB.id });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("NAO_ENCONTRADO");

    // confirma que o gate original continua intocado (não foi decidido por engano)
    const original = await withTenant(prisma, tenantA.id, (tx) => tx.gate.findUniqueOrThrow({ where: { id: gate.id } }));
    expect(original.status).toBe("PENDENTE");
  });

  it("sem tenant context (nenhum withTenant/withSystem), nenhuma linha é retornada — fail-closed", async () => {
    const semContexto = await prisma.gate.findMany();
    expect(semContexto).toHaveLength(0);
  });
});

describe("Gates — máquina de estados (comportamento via decidirGate; a função pura transicaoValida tem teste unitário próprio em tests/unit/gates.test.ts)", () => {
  it("aprovar um Gate já aprovado falha com JA_DECIDIDO (não permite dupla decisão)", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste dupla decisão",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });

    const primeira = await decidirGate(prisma, { tenantId: tenantA.id, gateId: gate.id, decisao: "APROVADO", decisorId: userA.id });
    expect(primeira.ok).toBe(true);

    const segunda = await decidirGate(prisma, { tenantId: tenantA.id, gateId: gate.id, decisao: "REJEITADO", decisorId: userA.id });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.motivo).toBe("JA_DECIDIDO");
  });

  it("rejeitar um Gate rejeitado (rejected→approved) falha — estado terminal não reabre", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste rejected->approved",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: gate.id, decisao: "REJEITADO", decisorId: userA.id });

    const tentativa = await decidirGate(prisma, { tenantId: tenantA.id, gateId: gate.id, decisao: "APROVADO", decisorId: userA.id });
    expect(tentativa.ok).toBe(false);
    if (!tentativa.ok) expect(tentativa.motivo).toBe("JA_DECIDIDO");
  });
});

describe("Gates — decisão exige humano real (autoaprovação por agente é estruturalmente impossível)", () => {
  it("CHECK de banco rejeita INSERT com status decidido e decisor_id nulo (mesmo via SQL bruto)", async () => {
    await expect(
      withTenant(prisma, tenantA.id, (tx) =>
        tx.$executeRaw`INSERT INTO gates (id, tenant_id, categoria, status, acao_proposta, motivo, solicitante_tipo, requested_at, expires_at)
          VALUES (gen_random_uuid()::text, ${tenantA.id}, 'COMERCIAL', 'APROVADO', 'x', 'x', 'AGENTE', now(), now() + interval '1 day')`,
      ),
    ).rejects.toThrow();
  });

  it("FK rejeita decisor_id apontando para um id que não é um User real (ex.: tentativa de 'yalla' se autoaprovar)", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste FK decisor",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });

    await expect(
      withTenant(prisma, tenantA.id, (tx) =>
        tx.$executeRaw`UPDATE gates SET status = 'APROVADO', decisor_id = 'yalla', decided_at = now() WHERE id = ${gate.id}`,
      ),
    ).rejects.toThrow();
  });

  it("decidirGate rejeita decisorId de usuário que não é membro deste tenant", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste decisor de outro tenant",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });

    // userB é membro do tenant B, não do tenant A
    const resultado = await decidirGate(prisma, { tenantId: tenantA.id, gateId: gate.id, decisao: "APROVADO", decisorId: userB.id });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("DECISOR_NAO_E_MEMBRO_DO_TENANT");
  });

  it("aprovação por humano real e membro do tenant funciona e grava decisorId", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste aprovação válida",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });

    const resultado = await decidirGate(prisma, { tenantId: tenantA.id, gateId: gate.id, decisao: "APROVADO", decisorId: userA.id });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.gate.decisorId).toBe(userA.id);
      expect(resultado.gate.status).toBe("APROVADO");
    }
  });
});

describe("Gates — concorrência", () => {
  it("duas decisões simultâneas no mesmo Gate: só uma vence, a outra recebe conflito", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste concorrência",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });

    const [r1, r2] = await Promise.all([
      decidirGate(prisma, { tenantId: tenantA.id, gateId: gate.id, decisao: "APROVADO", decisorId: userA.id }),
      decidirGate(prisma, { tenantId: tenantA.id, gateId: gate.id, decisao: "REJEITADO", decisorId: userA.id }),
    ]);

    const oks = [r1, r2].filter((r) => r.ok);
    const falhas = [r1, r2].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    if (!falhas[0]!.ok) expect(falhas[0]!.motivo).toBe("JA_DECIDIDO");
  });
});

describe("Gates — expiração", () => {
  it("Gate criado com expiração já vencida não pode ser aprovado — vira EXPIRADO", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste expiração",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
      expiraEmMs: -1000, // já nasce vencido
    });

    const resultado = await decidirGate(prisma, { tenantId: tenantA.id, gateId: gate.id, decisao: "APROVADO", decisorId: userA.id });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("EXPIRADO");

    const atual = await withTenant(prisma, tenantA.id, (tx) => tx.gate.findUniqueOrThrow({ where: { id: gate.id } }));
    expect(atual.status).toBe("EXPIRADO");
  });

  it("Gate vencido não aparece em listarGatesPendentes (sweep automático na listagem)", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste expiração na listagem",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
      expiraEmMs: -1000,
    });

    const pendentes = await listarGatesPendentes(prisma, tenantA.id);
    expect(pendentes.find((g) => g.id === gate.id)).toBeUndefined();
  });
});

describe("Audit Log — append-only real em banco", () => {
  it("UPDATE via SQL bruto num evento já persistido lança exceção", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste audit append-only",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });
    const evento = await withTenant(prisma, tenantA.id, (tx) => tx.auditLog.findFirstOrThrow({ where: { entidadeId: gate.id, acao: "gate_requested" } }));

    await expect(
      withTenant(prisma, tenantA.id, (tx) => tx.$executeRaw`UPDATE audit_logs SET resultado = 'adulterado' WHERE id = ${evento.id}`),
    ).rejects.toThrow(/append-only/);
  });

  it("DELETE via SQL bruto num evento já persistido lança exceção", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste audit delete",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });
    const evento = await withTenant(prisma, tenantA.id, (tx) => tx.auditLog.findFirstOrThrow({ where: { entidadeId: gate.id, acao: "gate_requested" } }));

    await expect(withTenant(prisma, tenantA.id, (tx) => tx.$executeRaw`DELETE FROM audit_logs WHERE id = ${evento.id}`)).rejects.toThrow(
      /append-only/,
    );
  });

  it("INSERT continua funcionando normalmente (o trigger só bloqueia UPDATE/DELETE)", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste audit insert",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });
    const eventos = await withTenant(prisma, tenantA.id, (tx) => tx.auditLog.findMany({ where: { entidadeId: gate.id } }));
    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos[0]!.acao).toBe("gate_requested");
    expect(eventos[0]!.actorType).toBe("AGENTE");
    expect(eventos[0]!.actorLabel).toBe("yalla");
  });

  it("Tenant B não lê AuditLog do Tenant A", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste audit isolamento",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });
    const eventosB = await withTenant(prisma, tenantB.id, (tx) => tx.auditLog.findMany({ where: { entidadeId: gate.id } }));
    expect(eventosB).toHaveLength(0);
  });

  it("aprovação de Gate grava evento de audit com actorType HUMANO e o userId do decisor", async () => {
    const gate = await criarGate(prisma, {
      tenantId: tenantA.id,
      categoria: "COMERCIAL",
      acaoProposta: "teste audit de aprovação",
      motivo: "teste",
      solicitanteTipo: "AGENTE",
      solicitanteLabel: "yalla",
    });
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: gate.id, decisao: "APROVADO", decisorId: userA.id });

    const eventoAprovacao = await withTenant(prisma, tenantA.id, (tx) =>
      tx.auditLog.findFirstOrThrow({ where: { entidadeId: gate.id, acao: "gate_aprovado" } }),
    );
    expect(eventoAprovacao.actorType).toBe("HUMANO");
    expect(eventoAprovacao.userId).toBe(userA.id);
  });
});
