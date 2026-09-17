import type { JobDefinition } from "./types";

/**
 * Job Registry (T5 §8) — mesmo padrão do Tool Registry de T3: `Map` em
 * memória, populado uma vez por processo (cache de módulos do Node). Tipo
 * não registrado nunca executa — default-deny (T5 §7).
 */
const REGISTRY = new Map<string, JobDefinition<any, any>>();

export function registrarJobType<TPayload, TResult>(def: JobDefinition<TPayload, TResult>): void {
  if (REGISTRY.has(def.type)) {
    throw new Error(`registrarJobType: job type "${def.type}" já registrado — cada type deve ter exatamente uma definição.`);
  }
  REGISTRY.set(def.type, def);
}

export function obterJobType(type: string): JobDefinition<any, any> | undefined {
  return REGISTRY.get(type);
}

export function listarJobTypes(): JobDefinition<any, any>[] {
  return [...REGISTRY.values()];
}
