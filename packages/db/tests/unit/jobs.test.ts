import { describe, expect, it } from "vitest";
import { calcularBackoffMs, prioridadeEfetiva } from "../../src/jobs/backoff";

describe("calcularBackoffMs — backoff exponencial com teto (T5 §12)", () => {
  it("dobra a cada tentativa: 1ª=base, 2ª=2x, 3ª=4x, 4ª=8x", () => {
    expect(calcularBackoffMs(1, 1000, 60_000)).toBe(1000);
    expect(calcularBackoffMs(2, 1000, 60_000)).toBe(2000);
    expect(calcularBackoffMs(3, 1000, 60_000)).toBe(4000);
    expect(calcularBackoffMs(4, 1000, 60_000)).toBe(8000);
  });

  it("nunca ultrapassa o teto (maxMs) mesmo com tentativa muito alta — evita tempestade de retry", () => {
    expect(calcularBackoffMs(20, 1000, 60_000)).toBe(60_000);
  });

  it("tentativa < 1 é inválida — lança erro em vez de devolver um valor sem sentido", () => {
    expect(() => calcularBackoffMs(0, 1000, 60_000)).toThrow();
    expect(() => calcularBackoffMs(-1, 1000, 60_000)).toThrow();
  });
});

describe("prioridadeEfetiva — aging anti-starvation (T5 §16)", () => {
  it("sem espera, prioridade efetiva é igual à nominal", () => {
    const agora = new Date("2026-09-10T12:00:00Z");
    expect(prioridadeEfetiva(0, agora, agora)).toBe(0);
    expect(prioridadeEfetiva(10, agora, agora)).toBe(10);
  });

  it("+1 a cada 5 minutos de espera", () => {
    const criadoEm = new Date("2026-09-10T12:00:00Z");
    const dez1min = new Date("2026-09-10T12:05:00Z");
    const dez2min = new Date("2026-09-10T12:10:00Z");
    expect(prioridadeEfetiva(0, criadoEm, dez1min)).toBe(1);
    expect(prioridadeEfetiva(0, criadoEm, dez2min)).toBe(2);
  });

  it("boost tem teto de +50 — não cresce pra sempre", () => {
    const criadoEm = new Date("2026-09-10T12:00:00Z");
    const muitoDepois = new Date("2026-09-11T12:00:00Z"); // 24h depois = 288 incrementos de 5min, bem acima do teto
    expect(prioridadeEfetiva(0, criadoEm, muitoDepois)).toBe(50);
  });

  it("um job de prioridade baixa esperando o bastante ultrapassa um job de prioridade alta recém-criado — prova a fairness", () => {
    const agora = new Date("2026-09-10T13:00:00Z");
    const baixaEsperandoMuito = prioridadeEfetiva(0, new Date("2026-09-10T12:00:00Z"), agora); // 60min de espera = +12
    const altaReceemChegada = prioridadeEfetiva(5, agora, agora); // acabou de chegar, prioridade nominal 5
    expect(baixaEsperandoMuito).toBeGreaterThan(altaReceemChegada);
  });
});
