import type { ToolDefinition } from "./types";

/**
 * Registro central — a ÚNICA fonte de verdade sobre quais tools existem.
 * Yalla nunca executa nome inventado pelo modelo, SQL arbitrário ou handler
 * não registrado: `obterTool` devolve `undefined` pra qualquer id que não
 * esteja aqui, e o Broker trata isso como DENY (NOT_FOUND) — nunca como
 * "tenta executar mesmo assim".
 */
const REGISTRY = new Map<string, ToolDefinition<any, any>>();

// Não-genérica de propósito: o registry em si é heterogêneo (cada tool tem
// seu próprio par TInput/TOutput) — a segurança de tipos de cada tool já
// aconteceu no `defineTool<TInput,TOutput>()` que a criou; aqui ela é
// erasada igual a qualquer outro Map de valores heterogêneos.
export function registrarTool(def: ToolDefinition<any, any>): void {
  if (REGISTRY.has(def.id)) {
    throw new Error(`Tool "${def.id}" já registrada — id duplicado (provável bug de composição do registry).`);
  }
  REGISTRY.set(def.id, def);
}

export function obterTool(id: string): ToolDefinition<any, any> | undefined {
  return REGISTRY.get(id);
}

export function listarTools(): ToolDefinition<any, any>[] {
  return [...REGISTRY.values()];
}

/** Só para testes — limpa e permite reconstruir o registry num estado conhecido. */
export function _resetRegistryParaTeste(): void {
  REGISTRY.clear();
}
