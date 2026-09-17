/**
 * "Última atividade" de um lead — usado tanto pela reavaliação de
 * repescagem (job `lead.repescar_elegibilidade`) quanto pelos painéis de
 * lead scoring/next best action no detalhe do lead, pra nunca divergir em
 * dois lugares a mesma pergunta ("faz quantos dias que ninguém mexe
 * nisso?"). Puro — sem acesso a banco, só compara datas já carregadas pelo
 * chamador.
 */
export function diasDesdeUltimaAtividade(timestamps: (Date | null | undefined)[]): number {
  const validos = timestamps.filter((d): d is Date => d != null);
  if (validos.length === 0) return Number.POSITIVE_INFINITY;
  const maisRecente = Math.max(...validos.map((d) => d.getTime()));
  return Math.floor((Date.now() - maisRecente) / (24 * 60 * 60 * 1000));
}
