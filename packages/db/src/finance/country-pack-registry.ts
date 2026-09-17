import type { CountryPack } from "./types";

/**
 * Registro central de Country Packs — mesmo padrão do Tool Registry (T3) e
 * Job Registry (T5): default-deny estrutural. Nenhum Country Pack é
 * inventado/assumido; `obterCountryPack` devolve `undefined` pra qualquer
 * jurisdição sem pack registrado, e quem chama trata isso como "regra
 * fiscal desconhecida", nunca como "aplica uma regra genérica/zero".
 *
 * Nesta rodada (PM-CRM-FIN-ARCH-01) o registry existe e é testável, mas
 * **nenhum Country Pack real está registrado** — nem Portugal, nem Brasil.
 * Implementar um pack de verdade exige regra validada por contador/
 * especialista (fora de escopo desta rodada), não só o contrato.
 */
const REGISTRY = new Map<string, CountryPack>();

export function registrarCountryPack(pack: CountryPack): void {
  if (REGISTRY.has(pack.id)) {
    throw new Error(`CountryPack "${pack.id}" já registrado — id duplicado.`);
  }
  REGISTRY.set(pack.id, pack);
}

export function obterCountryPack(id: string): CountryPack | undefined {
  return REGISTRY.get(id);
}

export function listarCountryPacks(): CountryPack[] {
  return [...REGISTRY.values()];
}

/** Só para testes — limpa e permite reconstruir o registry num estado conhecido. */
export function _resetCountryPackRegistryParaTeste(): void {
  REGISTRY.clear();
}
