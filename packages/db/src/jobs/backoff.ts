/**
 * Funções puras (T5 §34 — testáveis sem banco): backoff exponencial com
 * teto, e prioridade efetiva com aging anti-starvation.
 */

/** Backoff exponencial: base * 2^(tentativa-1), nunca acima de maxMs. `tentativa` é 1-based (1ª nova tentativa = tentativa 1). */
export function calcularBackoffMs(tentativa: number, baseMs: number, maxMs: number): number {
  if (tentativa < 1) throw new Error("calcularBackoffMs: tentativa deve ser >= 1");
  const exponencial = baseMs * Math.pow(2, tentativa - 1);
  return Math.min(exponencial, maxMs);
}

/**
 * Prioridade efetiva usada na ORDER BY do claim (T5 §16 — fairness/anti-
 * starvation): a prioridade nominal sobe +1 a cada 5 minutos de espera, até
 * um teto de +50 — um job de prioridade baixa, esperando o suficiente,
 * eventualmente ultrapassa um fluxo contínuo de prioridade alta em vez de
 * ficar preso pra sempre. Mesma fórmula usada em SQL puro dentro de
 * `reivindicarProximoJob` (ver engine.ts) — esta versão em TS existe só
 * para ser testável isoladamente; não é chamada em runtime pelo claim real
 * (que roda a conta direto no banco pra manter o claim atômico).
 */
export function prioridadeEfetiva(prioridade: number, criadoEm: Date, agora: Date): number {
  const minutosEsperando = Math.max(0, (agora.getTime() - criadoEm.getTime()) / 60_000);
  const boost = Math.min(Math.floor(minutosEsperando / 5), 50);
  return prioridade + boost;
}
