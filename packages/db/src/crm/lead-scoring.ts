/**
 * Lead Scoring — FOUNDATION (PM-NIGHT-RUN-01, Etapa 3, §22). Só fatores
 * DETERMINÍSTICOS e configuráveis, sem IA/LLM decidindo o score — "evitar
 * score opaco gerado exclusivamente por LLM". Cada fator registra o motivo
 * ("registrar o motivo do score quando possível") — nunca um número sem
 * explicação. IA poderá complementar no futuro; não implementado aqui.
 *
 * Puro — sem acesso a banco. Quem chama (página do CRM) monta o input a
 * partir de dados já carregados.
 */

export interface LeadScoreInput {
  temEmail: boolean;
  temTelefone: boolean;
  preferenciasCliente: Record<string, unknown> | null;
  etapaOrdem: number;
  totalEtapas: number;
  /** dias desde a última atividade (Note/Task/Message) — null = nenhuma atividade além da criação do lead. */
  diasDesdeUltimaAtividade: number | null;
  temAtribuicao: boolean;
}

export interface FatorScore {
  fator: string;
  peso: number;
  pontos: number;
  motivo: string;
}

export interface ResultadoScore {
  score: number; // 0-100
  fatores: FatorScore[];
}

const CAMPOS_PREFERENCIAS = ["datasDesejadas", "quantidadePassageiros", "orcamentoInformado", "preferenciaRoteiro", "observacoes"] as const;

export function calcularScoreLead(input: LeadScoreInput): ResultadoScore {
  const fatores: FatorScore[] = [];

  const pontosContato = (input.temEmail ? 8 : 0) + (input.temTelefone ? 7 : 0);
  fatores.push({
    fator: "completude_contato",
    peso: 15,
    pontos: pontosContato,
    motivo: `email: ${input.temEmail ? "sim" : "não"}, telefone: ${input.temTelefone ? "sim" : "não"}`,
  });

  const prefs = input.preferenciasCliente ?? {};
  const preenchidos = CAMPOS_PREFERENCIAS.filter((k) => prefs[k] != null && prefs[k] !== "").length;
  fatores.push({
    fator: "completude_viagem",
    peso: 30,
    pontos: preenchidos * 6,
    motivo: `${preenchidos}/${CAMPOS_PREFERENCIAS.length} campos de preferência informados`,
  });

  const progresso = input.totalEtapas > 1 ? Math.round((input.etapaOrdem / (input.totalEtapas - 1)) * 25) : 0;
  fatores.push({
    fator: "progresso_funil",
    peso: 25,
    pontos: Math.min(25, Math.max(0, progresso)),
    motivo: `etapa ${input.etapaOrdem + 1} de ${input.totalEtapas}`,
  });

  let pontosEngajamento: number;
  let motivoEngajamento: string;
  if (input.diasDesdeUltimaAtividade == null) {
    pontosEngajamento = 0;
    motivoEngajamento = "sem atividade registrada além da criação";
  } else if (input.diasDesdeUltimaAtividade <= 1) {
    pontosEngajamento = 20;
    motivoEngajamento = "atividade nas últimas 24h";
  } else if (input.diasDesdeUltimaAtividade <= 3) {
    pontosEngajamento = 14;
    motivoEngajamento = `última atividade há ${input.diasDesdeUltimaAtividade} dias`;
  } else if (input.diasDesdeUltimaAtividade <= 7) {
    pontosEngajamento = 8;
    motivoEngajamento = `última atividade há ${input.diasDesdeUltimaAtividade} dias`;
  } else {
    pontosEngajamento = 2;
    motivoEngajamento = `última atividade há ${input.diasDesdeUltimaAtividade} dias (esfriando)`;
  }
  fatores.push({ fator: "engajamento_recente", peso: 20, pontos: pontosEngajamento, motivo: motivoEngajamento });

  // Bônus por ter origem de marketing rastreada — nunca julga UM canal como
  // melhor que outro (isso seria um viés de negócio não comprovado), só
  // premia o fato de a origem ser conhecida (útil pra atribuição/CAC depois).
  fatores.push({
    fator: "origem_rastreada",
    peso: 10,
    pontos: input.temAtribuicao ? 10 : 0,
    motivo: input.temAtribuicao ? "origem de marketing identificada" : "origem não rastreada",
  });

  const score = fatores.reduce((soma, f) => soma + f.pontos, 0);
  return { score: Math.min(100, Math.max(0, score)), fatores };
}
