import { describe, expect, it } from "vitest";
import { sugerirProximaAcao } from "../../src/crm/next-best-action";

const BASE = {
  status: "ABERTO" as const,
  etapaIsWon: false,
  etapaIsLost: false,
  conversaComIA: true,
  preferenciasCliente: { datasDesejadas: "x", quantidadePassageiros: 2, orcamentoInformado: "y" },
  diasDesdeUltimaAtividade: 0,
  temTarefaPendente: false,
};

describe("sugerirProximaAcao — recomendação, nunca execução", () => {
  it("lead em etapa terminal (ganho) → nenhuma ação necessária", () => {
    const r = sugerirProximaAcao({ ...BASE, status: "GANHO", etapaIsWon: true });
    expect(r.acao).toBe("nenhuma_acao_necessaria");
  });

  it("lead em etapa terminal (perdido) → nenhuma ação necessária", () => {
    const r = sugerirProximaAcao({ ...BASE, status: "PERDIDO", etapaIsLost: true });
    expect(r.acao).toBe("nenhuma_acao_necessaria");
  });

  it("conversa já com humano → nenhuma ação necessária (Yalla não interfere)", () => {
    const r = sugerirProximaAcao({ ...BASE, conversaComIA: false });
    expect(r.acao).toBe("nenhuma_acao_necessaria");
  });

  it("faltando dados-chave → solicitar informação faltante", () => {
    const r = sugerirProximaAcao({ ...BASE, preferenciasCliente: { datasDesejadas: "x" } });
    expect(r.acao).toBe("solicitar_informacao_faltante");
    expect(r.motivo).toContain("quantidadePassageiros");
  });

  it("dados completos + sem atividade há dias + sem tarefa pendente → repescar oportunidade", () => {
    const r = sugerirProximaAcao({ ...BASE, diasDesdeUltimaAtividade: 5, temTarefaPendente: false });
    expect(r.acao).toBe("repescar_oportunidade");
  });

  it("dados completos + atividade recente + sem tarefa pendente → agendar retorno", () => {
    const r = sugerirProximaAcao({ ...BASE, diasDesdeUltimaAtividade: 0, temTarefaPendente: false });
    expect(r.acao).toBe("agendar_retorno");
  });

  it("dados completos + já tem tarefa pendente → preparar proposta", () => {
    const r = sugerirProximaAcao({ ...BASE, temTarefaPendente: true, diasDesdeUltimaAtividade: 0 });
    expect(r.acao).toBe("preparar_proposta");
  });

  it("toda sugestão vem com motivo explicando a escolha", () => {
    const r = sugerirProximaAcao(BASE);
    expect(r.motivo).toBeTruthy();
  });
});
