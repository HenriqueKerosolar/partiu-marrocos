/**
 * Next Best Action — FOUNDATION (PM-NIGHT-RUN-01, Etapa 3, §23). Isto é
 * uma RECOMENDAÇÃO, nunca execução automática — "ação recomendada ≠
 * execução automática". A UI só exibe a sugestão; Tool Broker/Gates
 * continuam sendo os únicos caminhos reais de execução (nada aqui chama
 * uma tool, cria um Job ou manda mensagem sozinho).
 *
 * Puro — sem acesso a banco, sem IA. Regras determinísticas simples, na
 * mesma linha do Lead Scoring (mesmo módulo).
 */

export type ProximaAcao =
  | "solicitar_informacao_faltante"
  | "agendar_retorno"
  | "encaminhar_humano"
  | "repescar_oportunidade"
  | "preparar_proposta"
  | "nenhuma_acao_necessaria";

export interface NextBestActionInput {
  status: "ABERTO" | "GANHO" | "PERDIDO";
  etapaIsWon: boolean;
  etapaIsLost: boolean;
  /** false quando um humano já assumiu a conversa (Conversation.aiEnabled=false). */
  conversaComIA: boolean;
  preferenciasCliente: Record<string, unknown> | null;
  diasDesdeUltimaAtividade: number | null;
  temTarefaPendente: boolean;
}

export interface SugestaoAcao {
  acao: ProximaAcao;
  motivo: string;
}

const CAMPOS_CHAVE = ["datasDesejadas", "quantidadePassageiros", "orcamentoInformado"] as const;

export function sugerirProximaAcao(input: NextBestActionInput): SugestaoAcao {
  if (input.status !== "ABERTO" || input.etapaIsWon || input.etapaIsLost) {
    return { acao: "nenhuma_acao_necessaria", motivo: "lead já está em etapa terminal (ganho ou perdido)" };
  }
  if (!input.conversaComIA) {
    return { acao: "nenhuma_acao_necessaria", motivo: "conversa já está sob atendimento humano" };
  }

  const prefs = input.preferenciasCliente ?? {};
  const faltando = CAMPOS_CHAVE.filter((k) => prefs[k] == null || prefs[k] === "");
  if (faltando.length > 0) {
    return { acao: "solicitar_informacao_faltante", motivo: `ainda faltam: ${faltando.join(", ")}` };
  }

  if (input.diasDesdeUltimaAtividade != null && input.diasDesdeUltimaAtividade >= 3 && !input.temTarefaPendente) {
    return { acao: "repescar_oportunidade", motivo: `sem atividade há ${input.diasDesdeUltimaAtividade} dias, sem follow-up agendado` };
  }

  if (!input.temTarefaPendente) {
    return { acao: "agendar_retorno", motivo: "dados de viagem completos, nenhum follow-up agendado ainda" };
  }

  return { acao: "preparar_proposta", motivo: "dados completos e follow-up já agendado — lead pronto para avançar" };
}
