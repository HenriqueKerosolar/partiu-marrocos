export * from "./types";
export * from "./registry";
export * from "./grants";
export * from "./broker";
export * from "./jsonSchema";

import { registrarTool } from "./registry";
import { leadConsultarTool, leadMoverStageTool, leadClassificarTool, leadAtualizarPreferenciasTool } from "./definitions/leads";
import { contatoConsultarTool, contatoAtualizarDadosTool } from "./definitions/contatos";
import { conversaConsultarHistoricoTool } from "./definitions/conversas";
import { notaRegistrarTool } from "./definitions/notas";
import { tarefaCriarTool } from "./definitions/tarefas";
import { atendimentoEncaminharHumanoTool } from "./definitions/atendimento";
import { leadAgendarRepescagemTool } from "./definitions/repescagem";
import { viagemConsultarContextoTool } from "./definitions/viagem";

export {
  leadConsultarTool,
  leadMoverStageTool,
  leadClassificarTool,
  leadAtualizarPreferenciasTool,
  contatoConsultarTool,
  contatoAtualizarDadosTool,
  conversaConsultarHistoricoTool,
  notaRegistrarTool,
  tarefaCriarTool,
  atendimentoEncaminharHumanoTool,
  leadAgendarRepescagemTool,
  viagemConsultarContextoTool,
};

/** Camada 1 (T3 §6) — consulta + escrita segura básica. */
export const CAMADA_1_TOOLS = [
  leadConsultarTool,
  contatoConsultarTool,
  conversaConsultarHistoricoTool,
  notaRegistrarTool,
  tarefaCriarTool,
  contatoAtualizarDadosTool,
  leadAtualizarPreferenciasTool,
  viagemConsultarContextoTool,
];

/**
 * Camada 2 (T3 §13) — mover stage/classificar/handoff. "Agendar retorno" e
 * "solicitar informação faltante" reaproveitam tarefa.criar/nota.registrar
 * da Camada 1 (ver comentários nos respectivos arquivos) — não duplicam
 * handler. `lead.agendar_repescagem` (CRM Evolution 01, PM-NIGHT-RUN-01
 * Etapa 3) só enfileira uma reavaliação futura — não decide nem envia nada
 * agora, por isso cabe na mesma camada de risco.
 */
export const CAMADA_2_TOOLS = [leadMoverStageTool, leadClassificarTool, atendimentoEncaminharHumanoTool, leadAgendarRepescagemTool];

// Registro acontece uma única vez por processo — o cache de módulos do
// Node garante isso (reimportar "./tools" nunca reexecuta o topo do
// arquivo), então não precisa de guard/flag extra aqui.
for (const tool of [...CAMADA_1_TOOLS, ...CAMADA_2_TOOLS]) registrarTool(tool);

/** Conjunto padrão de capabilities do agente "yalla" nesta rodada — usado pelo seed e por `provisionarGrantsPadrao` (default-deny: nada além disto é concedido). */
export const CAPABILITIES_PADRAO_YALLA = [...CAMADA_1_TOOLS, ...CAMADA_2_TOOLS].map((t) => t.capability);
