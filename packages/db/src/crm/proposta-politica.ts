/**
 * Política comercial de proposta (Proposal Foundation 01, PM-NIGHT-RUN-01
 * Etapa 5, §33/§34) — decide se um Gate COMERCIAL é necessário ANTES do
 * envio de uma proposta ao cliente. Pura, determinística, sem acesso a
 * banco — mesma filosofia de `lead-scoring.ts`/`next-best-action.ts`:
 * cada motivo é explicável, nunca um "sim/não" opaco.
 *
 * Cobre os 5 gatilhos comerciais citados pela autorização: desconto
 * relevante, mudança de preço excepcional, margem abaixo do limite,
 * condição comercial excepcional, compromisso externo sensível. Os dois
 * últimos são sinalizadores DECLARADOS por quem cria a proposta (nunca
 * inferidos algoritmicamente — "excepcional"/"sensível" é uma decisão de
 * negócio, não um limiar objetivo); os três primeiros são calculados a
 * partir de números já presentes na proposta.
 *
 * "Yalla pode preparar/recomendar, nunca autoaprovar" (§34): esta função
 * só INFORMA se um Gate é necessário — quem efetivamente cria o Gate e
 * bloqueia o envio é o chamador (`enviarProposta`); esta função nunca
 * decide sozinha que está tudo bem, nunca aprova nada.
 *
 * Limiares configuráveis por tenant (PM-NIGHT-RUN-02, Etapa 3, §23) —
 * corrige a limitação registrada em Proposal Foundation 01 ("limiares
 * fixos, não configuráveis por tenant"). `limites` é opcional e tem
 * default igual aos valores fixos originais (`LIMITES_PADRAO`) — um tenant
 * sem `CommercialPolicy` configurada continua com o comportamento de
 * sempre, sem mudança de comportamento silenciosa.
 */

export interface PropostaPoliticaInput {
  preco: number;
  precoReferencia: number | null;
  custos: number | null;
  precoVersaoAnterior: number | null; // preço da versão substituída, quando esta proposta é uma nova versão
  condicaoExcepcional: boolean;
  compromissoExternoSensivel: boolean;
}

export interface MotivoPoliticaComercial {
  fator: "desconto_relevante" | "mudanca_preco_excepcional" | "margem_abaixo_do_limite" | "condicao_comercial_excepcional" | "compromisso_externo_sensivel";
  motivo: string;
}

export interface ResultadoPoliticaComercial {
  exigeGate: boolean;
  motivos: MotivoPoliticaComercial[];
}

export interface LimitesPoliticaComercial {
  limiteDescontoRelevante: number; // fração (0.15 = 15%) abaixo do preço de referência
  limiteMudancaPrecoExcepcional: number; // fração de variação entre versões
  limiteMargemMinima: number; // fração mínima aceitável de margem
}

// Defaults da fundação — mesmos valores fixos que existiam antes desta
// etapa tornar o limiar configurável; preservados como "estado seguro"
// pra qualquer tenant sem CommercialPolicy própria (§23: "preservar
// defaults seguros para tenant existente").
export const LIMITES_PADRAO: LimitesPoliticaComercial = {
  limiteDescontoRelevante: 0.15,
  limiteMudancaPrecoExcepcional: 0.2,
  limiteMargemMinima: 0.1,
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function avaliarPoliticaComercial(input: PropostaPoliticaInput, limites: LimitesPoliticaComercial = LIMITES_PADRAO): ResultadoPoliticaComercial {
  const motivos: MotivoPoliticaComercial[] = [];

  if (input.precoReferencia != null && input.precoReferencia > 0) {
    const desconto = (input.precoReferencia - input.preco) / input.precoReferencia;
    if (desconto >= limites.limiteDescontoRelevante) {
      motivos.push({ fator: "desconto_relevante", motivo: `desconto de ${pct(desconto)} sobre o preço de referência (limite: ${pct(limites.limiteDescontoRelevante)})` });
    }
  }

  if (input.precoVersaoAnterior != null && input.precoVersaoAnterior > 0) {
    const variacao = Math.abs(input.preco - input.precoVersaoAnterior) / input.precoVersaoAnterior;
    if (variacao >= limites.limiteMudancaPrecoExcepcional) {
      motivos.push({ fator: "mudanca_preco_excepcional", motivo: `preço mudou ${pct(variacao)} em relação à versão anterior (limite: ${pct(limites.limiteMudancaPrecoExcepcional)})` });
    }
  }

  if (input.custos != null && input.preco > 0) {
    const margem = (input.preco - input.custos) / input.preco;
    if (margem < limites.limiteMargemMinima) {
      motivos.push({ fator: "margem_abaixo_do_limite", motivo: `margem de ${pct(margem)} abaixo do limite (${pct(limites.limiteMargemMinima)})` });
    }
  }

  if (input.condicaoExcepcional) {
    motivos.push({ fator: "condicao_comercial_excepcional", motivo: "condição comercial excepcional declarada na proposta" });
  }

  if (input.compromissoExternoSensivel) {
    motivos.push({ fator: "compromisso_externo_sensivel", motivo: "compromisso externo sensível declarado na proposta" });
  }

  return { exigeGate: motivos.length > 0, motivos };
}
