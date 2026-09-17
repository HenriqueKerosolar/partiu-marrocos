import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma, withSystem, verificarLimiteTaxa, purgarBucketsExpirados } from "../../src";

/**
 * PM-PRE-GOLIVE-MASTER-01, §9 — rate limiter atômico em Postgres,
 * substituindo o Map em memória (não seguro sob múltiplas instâncias).
 * Atomicidade via INSERT...ON CONFLICT — testada aqui com concorrência
 * REAL (Promise.all), não sequencial, mesmo rigor do Job Engine (§5E).
 */

function chaveUnica(sufixo: string): string {
  return `teste-rl-${sufixo}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

afterEach(async () => {
  await withSystem(prisma, (tx) => tx.rateLimitBucket.deleteMany({ where: { key: { startsWith: "teste-rl-" } } }));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("verificarLimiteTaxa — comportamento básico", () => {
  it("permite até o limite, rejeita a partir da N+1ª chamada", async () => {
    const chave = chaveUnica("basico");
    for (let i = 0; i < 5; i++) {
      const r = await verificarLimiteTaxa(prisma, chave, 5, 60_000);
      expect(r.allowed).toBe(true);
    }
    const r6 = await verificarLimiteTaxa(prisma, chave, 5, 60_000);
    expect(r6.allowed).toBe(false);
    expect(r6.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("chaves diferentes têm contadores independentes", async () => {
    const chaveA = chaveUnica("a");
    const chaveB = chaveUnica("b");
    for (let i = 0; i < 3; i++) await verificarLimiteTaxa(prisma, chaveA, 3, 60_000);

    const rA = await verificarLimiteTaxa(prisma, chaveA, 3, 60_000);
    expect(rA.allowed).toBe(false); // 4ª chamada, limite 3

    const rB = await verificarLimiteTaxa(prisma, chaveB, 3, 60_000);
    expect(rB.allowed).toBe(true); // primeira chamada de uma chave nova, nunca afetada pela outra
  });

  it("janela expira e reseta o contador — não fica bloqueado pra sempre", async () => {
    const chave = chaveUnica("janela");
    const janelaMs = 300;
    for (let i = 0; i < 3; i++) await verificarLimiteTaxa(prisma, chave, 3, janelaMs);
    const bloqueado = await verificarLimiteTaxa(prisma, chave, 3, janelaMs);
    expect(bloqueado.allowed).toBe(false);

    await new Promise((r) => setTimeout(r, janelaMs + 100));

    const aposJanela = await verificarLimiteTaxa(prisma, chave, 3, janelaMs);
    expect(aposJanela.allowed).toBe(true); // janela nova, contador reiniciado
  });
});

describe("verificarLimiteTaxa — concorrência real (não sequencial)", () => {
  it("N chamadas verdadeiramente simultâneas (Promise.all) pra mesma chave: exatamente `limite` são permitidas, nunca mais", async () => {
    const chave = chaveUnica("concorrencia");
    const limite = 10;
    const totalChamadas = 30;

    const resultados = await Promise.all(Array.from({ length: totalChamadas }, () => verificarLimiteTaxa(prisma, chave, limite, 60_000)));
    const permitidas = resultados.filter((r) => r.allowed).length;
    const negadas = resultados.filter((r) => !r.allowed).length;

    // A atomicidade do UPSERT garante que o contador nunca "perde" um
    // incremento sob corrida real — por isso EXATAMENTE `limite` chamadas
    // passam, nunca mais (o que aconteceria se duas chamadas concorrentes
    // lessem o mesmo valor antes de qualquer uma escrever — a classe de
    // bug que esta implementação existe pra eliminar).
    expect(permitidas).toBe(limite);
    expect(negadas).toBe(totalChamadas - limite);

    const bucket = await withSystem(prisma, (tx) => tx.rateLimitBucket.findUniqueOrThrow({ where: { key: chave } }));
    expect(bucket.count).toBe(totalChamadas); // conta toda tentativa, permitida ou não — nenhum incremento perdido
  });

  it("carga proporcional: 100 chamadas concorrentes, limite 20 — resultado determinístico mesmo sob concorrência real", async () => {
    const chave = chaveUnica("carga");
    const limite = 20;
    const totalChamadas = 100;

    const resultados = await Promise.all(Array.from({ length: totalChamadas }, () => verificarLimiteTaxa(prisma, chave, limite, 60_000)));
    expect(resultados.filter((r) => r.allowed).length).toBe(limite);
  });
});

describe("purgarBucketsExpirados — limpeza, nunca remove janela ativa", () => {
  it("remove só buckets cuja janela expirou há mais que a margem, preserva os ativos", async () => {
    const chaveAntiga = chaveUnica("antiga");
    const chaveAtiva = chaveUnica("ativa");
    await verificarLimiteTaxa(prisma, chaveAntiga, 5, 100); // janela de 100ms
    await verificarLimiteTaxa(prisma, chaveAtiva, 5, 60_000); // janela de 1 minuto, continua ativa

    await new Promise((r) => setTimeout(r, 200));

    const removidos = await purgarBucketsExpirados(prisma, 0); // margem 0 — remove tudo cuja janela já expirou
    expect(removidos).toBeGreaterThanOrEqual(1);

    const ainda = await withSystem(prisma, (tx) => tx.rateLimitBucket.findMany({ where: { key: { in: [chaveAntiga, chaveAtiva] } } }));
    expect(ainda.map((b) => b.key)).toEqual([chaveAtiva]); // só a ativa sobrou
  });
});
