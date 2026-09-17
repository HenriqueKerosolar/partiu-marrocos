import { describe, expect, it } from "vitest";
import { calcularScoreLead } from "../../src/crm/lead-scoring";

const BASE = {
  temEmail: false,
  temTelefone: false,
  preferenciasCliente: null,
  etapaOrdem: 0,
  totalEtapas: 5,
  diasDesdeUltimaAtividade: null,
  temAtribuicao: false,
};

describe("calcularScoreLead — determinístico, explicável", () => {
  it("lead vazio (nada informado) tem score baixo, mas nunca negativo", () => {
    const r = calcularScoreLead(BASE);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThan(20);
  });

  it("lead completo (todos os fatores positivos) chega perto do máximo (100)", () => {
    const r = calcularScoreLead({
      temEmail: true,
      temTelefone: true,
      preferenciasCliente: { datasDesejadas: "out/2026", quantidadePassageiros: 2, orcamentoInformado: "5-8k", preferenciaRoteiro: "deserto", observacoes: "lua de mel" },
      etapaOrdem: 4,
      totalEtapas: 5,
      diasDesdeUltimaAtividade: 0,
      temAtribuicao: true,
    });
    expect(r.score).toBe(100);
  });

  it("score nunca ultrapassa 100 nem fica negativo, mesmo com input no limite", () => {
    const r = calcularScoreLead({ ...BASE, etapaOrdem: 999, totalEtapas: 1 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("todo fator tem motivo explicando o valor — nunca um número opaco", () => {
    const r = calcularScoreLead(BASE);
    for (const f of r.fatores) {
      expect(f.motivo).toBeTruthy();
      expect(typeof f.motivo).toBe("string");
    }
  });

  it("atividade recente pontua mais que atividade antiga, sem nenhum outro fator mudar", () => {
    const recente = calcularScoreLead({ ...BASE, diasDesdeUltimaAtividade: 0 });
    const antiga = calcularScoreLead({ ...BASE, diasDesdeUltimaAtividade: 30 });
    expect(recente.score).toBeGreaterThan(antiga.score);
  });

  it("não julga UM canal de origem como melhor que outro — só premia ter origem rastreada ou não", () => {
    const comAtribuicao = calcularScoreLead({ ...BASE, temAtribuicao: true });
    const semAtribuicao = calcularScoreLead({ ...BASE, temAtribuicao: false });
    const fatorCom = comAtribuicao.fatores.find((f) => f.fator === "origem_rastreada")!;
    const fatorSem = semAtribuicao.fatores.find((f) => f.fator === "origem_rastreada")!;
    expect(fatorCom.pontos).toBeGreaterThan(fatorSem.pontos);
  });
});
