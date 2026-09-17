import { PrismaClient, Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { withSystem, withTenant } from "../../src/tenant-db";
import { decidirGate } from "../../src/gates";
import {
  preCheckCusto,
  registrarCostEvent,
  salvarPolitica,
  removerPolitica,
  listarPoliticas,
  obterConsumoAtual,
  resolverPreco,
  calcularCusto,
} from "../../src/cost-control";

/**
 * T2 — Cost Control. Mesmo critério de teste negativo real das outras
 * suítes deste pacote (RLS/gates/secrets): tentar ativamente vazar/burlar/
 * duplicar/correr e falhar, não só "não vi quebrar".
 */
const prisma = new PrismaClient();

let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (cost teste)", slug: `cost-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (cost teste)", slug: `cost-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `cost-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const roleA = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: roleA.id } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } });
    await tx.tenant.delete({ where: { id: tenantB.id } });
    await tx.user.delete({ where: { id: userA.id } });
  });
  await prisma.$disconnect();
}, 30000);

// Preço de teste usado em quase toda suíte — nunca um preço "de produção"
// real (a autorização pediu explicitamente para não declarar preços reais
// sem homologação nesta rodada).
const PROVIDER_TESTE = "provider-teste-cost-control";
let precosCriados: string[] = [];

afterEach(async () => {
  if (precosCriados.length > 0) {
    await prisma.modelPrice.deleteMany({ where: { id: { in: precosCriados } } });
    precosCriados = [];
  }
  // Sem isso, CostUsage (acumulador) e CostPolicy vazam de um teste pro
  // próximo (mesmo tenantA, mesmo escopo TENANT/PROVIDER, mesmo dia/mês
  // real) — cada teste precisa começar do zero. costEvent é append-only,
  // mas withSystem() é exatamente a exceção reservada pra isso (mesmo
  // padrão de limpeza de outras suítes deste pacote).
  await withSystem(prisma, async (tx) => {
    await tx.costEvent.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.costUsage.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.costPolicy.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.gate.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } }); // cascata: cost_gate_consumos
  });
});

async function criarPrecoTeste(over: Partial<Parameters<typeof prisma.modelPrice.create>[0]["data"]> = {}) {
  const preco = await prisma.modelPrice.create({
    data: {
      provider: PROVIDER_TESTE,
      moeda: "USD",
      unidade: "token",
      precoEntrada: new Prisma.Decimal("0.000003"),
      precoSaida: new Prisma.Decimal("0.000015"),
      versao: "teste",
      vigenteDesde: new Date("2020-01-01"),
      ...over,
    },
  });
  precosCriados.push(preco.id);
  return preco;
}

describe("resolverPreco — catálogo (global, versionado)", () => {
  it("sem nenhuma entrada cadastrada, devolve null (nunca inventa preço)", async () => {
    const preco = await resolverPreco(prisma, { provider: "provider-sem-preco-nenhum" });
    expect(preco).toBeNull();
  });

  it("prefere a entrada mais específica (model+capability > provider curinga)", async () => {
    await criarPrecoTeste({ model: null, capability: null, precoEntrada: new Prisma.Decimal("0.000001") }); // curinga do provider
    await criarPrecoTeste({ model: "modelo-x", capability: null, precoEntrada: new Prisma.Decimal("0.000009") }); // específica do modelo

    const generico = await resolverPreco(prisma, { provider: PROVIDER_TESTE, model: "outro-modelo" });
    expect(generico!.precoEntrada!.toString()).toBe("0.000001");

    const especifico = await resolverPreco(prisma, { provider: PROVIDER_TESTE, model: "modelo-x" });
    expect(especifico!.precoEntrada!.toString()).toBe("0.000009");
  });

  it("nunca escolhe um preço com vigência FUTURA", async () => {
    const futuro = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await criarPrecoTeste({ vigenteDesde: futuro, precoEntrada: new Prisma.Decimal("999") });
    await criarPrecoTeste({ vigenteDesde: new Date("2020-01-01"), precoEntrada: new Prisma.Decimal("0.000002") });

    const resolvido = await resolverPreco(prisma, { provider: PROVIDER_TESTE });
    expect(resolvido!.precoEntrada!.toString()).toBe("0.000002");
  });
});

describe("CostEvent — nunca vira custo zero quando é desconhecido", () => {
  it("provider sem NENHUM preço cadastrado: evento é gravado com costKind UNKNOWN e custoTotal null", async () => {
    const { evento } = await registrarCostEvent(prisma, {
      tenantId: tenantA.id,
      provider: "provider-realmente-sem-preco",
      operation: "chat",
      usage: { inputTokens: 100, outputTokens: 50 },
      source: "teste",
      actorType: "SISTEMA",
    });
    expect(evento.costKind).toBe("UNKNOWN");
    expect(evento.custoTotal).toBeNull();
  });
});

describe("CostEvent — idempotência", () => {
  it("mesma idempotencyKey enviada duas vezes: custo contabilizado uma única vez", async () => {
    await criarPrecoTeste();
    const idempotencyKey = `idem-${Date.now()}`;

    const primeira = await registrarCostEvent(prisma, {
      tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 100, outputTokens: 50 }, source: "teste", idempotencyKey, actorType: "SISTEMA",
    });
    const segunda = await registrarCostEvent(prisma, {
      tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 100, outputTokens: 50 }, source: "teste", idempotencyKey, actorType: "SISTEMA",
    });

    expect(primeira.duplicado).toBe(false);
    expect(segunda.duplicado).toBe(true);
    expect(segunda.evento.id).toBe(primeira.evento.id);

    const linhas = await withTenant(prisma, tenantA.id, (tx) => tx.costEvent.findMany({ where: { tenantId: tenantA.id, idempotencyKey } }));
    expect(linhas).toHaveLength(1);
  });

  it("idempotencyKey diferente sempre grava um novo evento", async () => {
    await criarPrecoTeste();
    const a = await registrarCostEvent(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 10, outputTokens: 5 }, source: "teste", idempotencyKey: `k1-${Date.now()}`, actorType: "SISTEMA" });
    const b = await registrarCostEvent(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 10, outputTokens: 5 }, source: "teste", idempotencyKey: `k2-${Date.now()}`, actorType: "SISTEMA" });
    expect(a.evento.id).not.toBe(b.evento.id);
  });
});

describe("CostEvent — append-only real em banco", () => {
  it("UPDATE via SQL bruto num evento já persistido lança exceção", async () => {
    await criarPrecoTeste();
    const { evento } = await registrarCostEvent(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 1, outputTokens: 1 }, source: "teste", actorType: "SISTEMA" });
    await expect(
      withTenant(prisma, tenantA.id, (tx) => tx.$executeRaw`UPDATE cost_events SET custo_total = 999 WHERE id = ${evento.id}`),
    ).rejects.toThrow(/append-only/);
  });

  it("DELETE via SQL bruto num evento já persistido lança exceção", async () => {
    await criarPrecoTeste();
    const { evento } = await registrarCostEvent(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 1, outputTokens: 1 }, source: "teste", actorType: "SISTEMA" });
    await expect(withTenant(prisma, tenantA.id, (tx) => tx.$executeRaw`DELETE FROM cost_events WHERE id = ${evento.id}`)).rejects.toThrow(/append-only/);
  });

  it("não amplia a exceção de T1: rls_bypass()/withSystem continua sendo a ÚNICA via (ex.: cascade delete de Tenant apaga seus cost_events sem erro)", async () => {
    const tenantTemp = await prisma.tenant.create({ data: { nome: "Tenant cascade cost", slug: `cost-cascade-${Date.now()}` } });
    await criarPrecoTeste();
    await registrarCostEvent(prisma, { tenantId: tenantTemp.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 1, outputTokens: 1 }, source: "teste", actorType: "SISTEMA" });
    await expect(withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantTemp.id } }))).resolves.not.toThrow();
  });
});

describe("CostEvent/CostPolicy — isolamento multi-tenant (RLS)", () => {
  it("Tenant B não lê CostEvent do Tenant A", async () => {
    await criarPrecoTeste();
    await registrarCostEvent(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 1, outputTokens: 1 }, source: "teste", actorType: "SISTEMA" });
    const doB = await withTenant(prisma, tenantB.id, (tx) => tx.costEvent.findMany({ where: { tenantId: tenantA.id } }));
    expect(doB).toHaveLength(0);
  });

  it("Tenant B não lê CostPolicy do Tenant A", async () => {
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "TENANT", periodo: "DIARIO", limite: "10", actorType: "HUMANO", userId: userA.id });
    const doB = await listarPoliticas(prisma, tenantB.id);
    expect(doB.filter((p) => p.tenantId === tenantA.id)).toHaveLength(0);
  });

  it("Tenant B não consegue remover política do Tenant A (IDOR)", async () => {
    const politica = await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: "x", periodo: "MENSAL", limite: "50", actorType: "HUMANO", userId: userA.id });
    const removeu = await removerPolitica(prisma, { tenantId: tenantB.id, politicaId: politica.id, actorType: "HUMANO" });
    expect(removeu).toBe(false);

    const aindaExiste = await withTenant(prisma, tenantA.id, (tx) => tx.costPolicy.findUnique({ where: { id: politica.id } }));
    expect(aindaExiste).not.toBeNull();
  });

  it("sem contexto de tenant, nenhuma linha é retornada — fail-closed", async () => {
    const eventos = await prisma.costEvent.findMany();
    const politicas = await prisma.costPolicy.findMany();
    expect(eventos).toHaveLength(0);
    expect(politicas).toHaveLength(0);
  });
});

describe("PRE-CHECK — ALLOW/WARN/REQUIRE_GATE", () => {
  it("sem nenhuma política ativa, sempre ALLOW", async () => {
    await criarPrecoTeste();
    const r = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 5 }, actorType: "SISTEMA" });
    expect(r.decisao).toBe("ALLOW");
  });

  it("abaixo do alertaPercentual, ALLOW", async () => {
    await criarPrecoTeste();
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "TENANT", periodo: "DIARIO", limite: "1000", alertaPercentual: "80", actorType: "HUMANO", userId: userA.id });
    const r = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 5 }, actorType: "SISTEMA" });
    expect(r.decisao).toBe("ALLOW");
  });

  it("no/acima do alertaPercentual mas abaixo do limite: WARN (não bloqueia)", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "TENANT", periodo: "DIARIO", limite: "100", alertaPercentual: "50", actorType: "HUMANO", userId: userA.id });
    // custo estimado = 90 (90% de 100) — acima do alerta de 50%, abaixo do limite
    const r = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 90, outputTokens: 0 }, actorType: "SISTEMA" });
    expect(r.decisao).toBe("WARN");

    const eventos = await withTenant(prisma, tenantA.id, (tx) => tx.auditLog.findMany({ where: { tenantId: tenantA.id, acao: "COST_THRESHOLD_WARNING" } }));
    expect(eventos.length).toBeGreaterThan(0);
  });

  it("estourando o limite pela primeira vez: REQUIRE_GATE, abre um Gate novo, categoria FINANCEIRO", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "TENANT", periodo: "DIARIO", limite: "5", actorType: "HUMANO", userId: userA.id });

    const r = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "AGENTE", actorLabel: "yalla" });
    expect(r.decisao).toBe("REQUIRE_GATE");
    expect(r.gateId).toBeTruthy();

    const gate = await withTenant(prisma, tenantA.id, (tx) => tx.gate.findUniqueOrThrow({ where: { id: r.gateId! } }));
    expect(gate.categoria).toBe("FINANCEIRO");
    expect(gate.status).toBe("PENDENTE");
  });

  it("a reserva otimista é desfeita quando estoura — não deixa CostUsage inflado por uma operação que não vai acontecer", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "DIARIO", limite: "5", actorType: "HUMANO", userId: userA.id });

    await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "SISTEMA" });

    const usage = await withTenant(prisma, tenantA.id, (tx) =>
      tx.costUsage.findFirst({ where: { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "DIARIO" } }),
    );
    // a reserva de 10 foi desfeita — não deve ter ficado presa em cost_usages
    expect(usage?.acumulado.toString() ?? "0").toBe("0");
  });
});

describe("PRE-CHECK — anti-loop de Gate", () => {
  it("duas tentativas seguidas com o mesmo estouro reusam o MESMO Gate pendente (nunca abre um segundo)", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "TENANT", periodo: "MENSAL", limite: "5", actorType: "HUMANO", userId: userA.id });

    const r1 = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "AGENTE", actorLabel: "yalla" });
    const r2 = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "AGENTE", actorLabel: "yalla" });

    expect(r1.decisao).toBe("REQUIRE_GATE");
    expect(r2.decisao).toBe("BLOCK");
    expect(r2.gateId).toBe(r1.gateId);

    const gates = await withTenant(prisma, tenantA.id, (tx) => tx.gate.findMany({ where: { tenantId: tenantA.id, categoria: "FINANCEIRO" } }));
    expect(gates).toHaveLength(1);
  });

  it("gate aprovado autoriza EXATAMENTE uma operação (consumo único) — terceira tentativa (já consumida) abre um Gate NOVO, não reaproveita nem trava para sempre", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "TENANT", periodo: "MENSAL", limite: "5", actorType: "HUMANO", userId: userA.id });

    const r1 = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "AGENTE", actorLabel: "yalla" });
    expect(r1.decisao).toBe("REQUIRE_GATE");

    const decisao = await decidirGate(prisma, { tenantId: tenantA.id, gateId: r1.gateId!, decisao: "APROVADO", decisorId: userA.id });
    expect(decisao.ok).toBe(true);

    // 2ª tentativa: consome a autorização aprovada, ALLOW
    const r2 = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "AGENTE", actorLabel: "yalla" });
    expect(r2.decisao).toBe("ALLOW");
    expect(r2.gateId).toBe(r1.gateId);

    // 3ª tentativa: autorização já foi consumida — não pode ser reaproveitada infinitamente, abre um Gate NOVO
    const r3 = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "AGENTE", actorLabel: "yalla" });
    expect(r3.decisao).toBe("REQUIRE_GATE");
    expect(r3.gateId).not.toBe(r1.gateId);
  });

  it("gate rejeitado NÃO autoriza nada e não trava para sempre — a próxima tentativa abre um Gate novo (nova decisão humana)", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "TENANT", periodo: "MENSAL", limite: "5", actorType: "HUMANO", userId: userA.id });

    const r1 = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "AGENTE", actorLabel: "yalla" });
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: r1.gateId!, decisao: "REJEITADO", decisorId: userA.id });

    const r2 = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "AGENTE", actorLabel: "yalla" });
    expect(r2.decisao).toBe("REQUIRE_GATE");
    expect(r2.gateId).not.toBe(r1.gateId);
  });

  it("consumo de gate é isolado por tenant — Gate de A nunca é consultável/consumível a partir de B", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "TENANT", periodo: "MENSAL", limite: "5", actorType: "HUMANO", userId: userA.id });
    const r1 = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "AGENTE", actorLabel: "yalla" });
    await decidirGate(prisma, { tenantId: tenantA.id, gateId: r1.gateId!, decisao: "APROVADO", decisorId: userA.id });

    const gateVisivelDeB = await withTenant(prisma, tenantB.id, (tx) => tx.gate.findUnique({ where: { id: r1.gateId! } }));
    expect(gateVisivelDeB).toBeNull();
  });
});

describe("Concorrência — duas operações simultâneas não podem juntas estourar um limite conhecido", () => {
  it("limite=10, duas chamadas concorrentes de custo 6 cada: só uma passa, CostUsage nunca ultrapassa o limite", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "DIARIO", limite: "10", actorType: "HUMANO", userId: userA.id });

    const [r1, r2] = await Promise.all([
      preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 6, outputTokens: 0 }, actorType: "SISTEMA" }),
      preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 6, outputTokens: 0 }, actorType: "SISTEMA" }),
    ]);

    const decisoes = [r1.decisao, r2.decisao];
    // exatamente uma passa (ALLOW ou WARN — as duas são "prossegue"), a outra é bloqueada (REQUIRE_GATE/BLOCK) — nunca as duas passam
    const passaram = decisoes.filter((d) => d === "ALLOW" || d === "WARN").length;
    const bloqueadas = decisoes.filter((d) => d === "REQUIRE_GATE" || d === "BLOCK").length;
    expect(passaram).toBe(1);
    expect(bloqueadas).toBe(1);

    const usage = await withTenant(prisma, tenantA.id, (tx) =>
      tx.costUsage.findFirst({ where: { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "DIARIO" } }),
    );
    // nunca mais que uma das duas reservas de 6 (nunca 12 — nunca as duas passaram)
    expect(usage!.acumulado.lte(new Prisma.Decimal(6))).toBe(true);
  });

  it("10 chamadas concorrentes de custo 1 contra um limite de 5: exatamente 5 passam (ALLOW ou WARN perto do teto), nunca mais, e o acumulado nunca ultrapassa o limite", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "MENSAL", limite: "5", actorType: "HUMANO", userId: userA.id });

    const resultados = await Promise.all(
      Array.from({ length: 10 }, () =>
        preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 1, outputTokens: 0 }, actorType: "SISTEMA" }),
      ),
    );
    // ALLOW e WARN são as duas decisões que deixam a operação prosseguir — perto do teto (>=80% default de alertaPercentual), a 4ª/5ª reserva vira WARN em vez de ALLOW simples, mas ainda PASSA.
    const passaram = resultados.filter((r) => r.decisao === "ALLOW" || r.decisao === "WARN").length;
    const bloqueadas = resultados.filter((r) => r.decisao === "REQUIRE_GATE" || r.decisao === "BLOCK").length;
    expect(passaram).toBe(5);
    expect(bloqueadas).toBe(5);

    const usage = await withTenant(prisma, tenantA.id, (tx) =>
      tx.costUsage.findFirst({ where: { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "MENSAL" } }),
    );
    // nunca ultrapassa o limite (a reserva otimista das outras 5 foi desfeita), e não sobra dinheiro "preso" por rollback incompleto — exatamente 5.
    expect(usage!.acumulado.toString()).toBe("5");
  });
});

describe("POST-RECORD — reconciliação com o valor real e nunca perde custo por estourar", () => {
  it("custo real diferente do estimado no pre-check: reconcilia o delta (não conta a estimativa E o real separadamente)", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("1") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "DIARIO", limite: "100", actorType: "HUMANO", userId: userA.id });

    const pre = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 10, outputTokens: 0 }, actorType: "SISTEMA" });
    expect(pre.decisao).toBe("ALLOW");

    // uso real veio maior que o estimado (provider devolveu mais tokens de saída do que o previsto)
    await registrarCostEvent(prisma, {
      tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 10, outputTokens: 5 }, source: "teste",
      custoEstimadoReservado: pre.custoEstimado, actorType: "SISTEMA",
    });

    const usage = await withTenant(prisma, tenantA.id, (tx) =>
      tx.costUsage.findFirst({ where: { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "DIARIO" } }),
    );
    // esperado: 10 (input) + 5 (output) = 15, não 10+15=25 (que seria dobrar a reserva)
    expect(usage!.acumulado.toString()).toBe("15");
  });

  it("registrarCostEvent sem pre-check anterior (custoEstimadoReservado ausente) soma o valor real inteiro", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "MENSAL", limite: "1000", actorType: "HUMANO", userId: userA.id });

    await registrarCostEvent(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 7, outputTokens: 0 }, source: "teste", actorType: "SISTEMA" });

    const usage = await withTenant(prisma, tenantA.id, (tx) =>
      tx.costUsage.findFirst({ where: { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "MENSAL" } }),
    );
    expect(usage!.acumulado.toString()).toBe("7");
  });

  it("custo real que ultrapassa o limite depois do fato NUNCA é perdido — o evento é gravado, só o audit muda", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "DIARIO", limite: "5", actorType: "HUMANO", userId: userA.id });

    // sem pre-check — o provider já respondeu com um custo real acima do limite
    const { evento } = await registrarCostEvent(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 20, outputTokens: 0 }, source: "teste", actorType: "SISTEMA" });

    expect(evento.custoTotal!.toString()).toBe("20"); // o custo real inteiro foi gravado, não truncado no limite
    const eventos = await withTenant(prisma, tenantA.id, (tx) => tx.auditLog.findMany({ where: { tenantId: tenantA.id, acao: "COST_LIMIT_REACHED", entidadeId: evento.id } }));
    expect(eventos.length).toBeGreaterThan(0);
  });
});

describe("Segurança — metadata nunca carrega o valor de um segredo (responsabilidade de quem chama, igual ao AuditLog)", () => {
  it("metadata é gravado como veio — quem chama é responsável por nunca passar segredo (mesmo contrato do AuditLog)", async () => {
    await criarPrecoTeste();
    const { evento } = await registrarCostEvent(prisma, {
      tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 1, outputTokens: 1 }, source: "teste",
      metadata: { conversationId: "conv-123" }, actorType: "SISTEMA",
    });
    expect(evento.metadata).toEqual({ conversationId: "conv-123" });
    expect(JSON.stringify(evento.metadata)).not.toMatch(/sk-|Bearer /);
  });
});

describe("Validação — valores inválidos nunca produzem custo/estado corrompido", () => {
  it("uso com tokens negativos lança erro em vez de gravar custo negativo", () => {
    expect(() => calcularCusto({ inputTokens: -5 }, null, { estimado: false })).toThrow();
  });

  it("salvarPolitica rejeita limite negativo", async () => {
    await expect(salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "TENANT", periodo: "DIARIO", limite: "-10", actorType: "HUMANO", userId: userA.id })).rejects.toThrow();
  });

  it("salvarPolitica rejeita alertaPercentual fora de 0-100", async () => {
    await expect(salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "TENANT", periodo: "MENSAL", limite: "10", alertaPercentual: "150", actorType: "HUMANO", userId: userA.id })).rejects.toThrow();
  });

  it("moeda diferente da política nunca é comparada/misturada (política em EUR não é afetada por evento em USD)", async () => {
    await criarPrecoTeste({ moeda: "USD", precoEntrada: new Prisma.Decimal("1"), precoSaida: new Prisma.Decimal("0") });
    await salvarPolitica(prisma, { tenantId: tenantA.id, escopo: "PROVIDER", escopoValor: PROVIDER_TESTE, periodo: "DIARIO", limite: "1", moeda: "EUR", actorType: "HUMANO", userId: userA.id });

    // custo estimado de 1000 USD nunca deveria estourar um limite de 1 EUR, porque moedas diferentes não se comparam nesta rodada
    const r = await preCheckCusto(prisma, { tenantId: tenantA.id, provider: PROVIDER_TESTE, operation: "chat", usageEstimado: { inputTokens: 1000, outputTokens: 0 }, actorType: "SISTEMA" });
    expect(r.decisao).toBe("ALLOW");
  });
});

describe("obterConsumoAtual — leitura para a UI (soma direta, independente de política)", () => {
  it("soma corretamente o consumo do dia mesmo sem nenhuma CostPolicy configurada", async () => {
    await criarPrecoTeste({ precoEntrada: new Prisma.Decimal("2"), precoSaida: new Prisma.Decimal("0") });
    const tenantSolo = await prisma.tenant.create({ data: { nome: "Tenant consumo solo", slug: `cost-solo-${Date.now()}` } });
    await registrarCostEvent(prisma, { tenantId: tenantSolo.id, provider: PROVIDER_TESTE, operation: "chat", usage: { inputTokens: 3, outputTokens: 0 }, source: "teste", actorType: "SISTEMA" });

    const consumo = await obterConsumoAtual(prisma, tenantSolo.id, "USD");
    expect(consumo.hoje.toString()).toBe("6");
    expect(consumo.mes.toString()).toBe("6");

    await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenantSolo.id } }));
  });
});
