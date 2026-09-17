import { afterEach, describe, expect, it } from "vitest";
import { registrarCountryPack, obterCountryPack, listarCountryPacks, _resetCountryPackRegistryParaTeste } from "../../src/finance/country-pack-registry";
import type { CountryPack } from "../../src/finance/types";

/**
 * Finance Core (PM-CRM-FIN-ARCH-01) — o registry em si, sem nenhum Country
 * Pack real (nem Portugal, nem Brasil). Mesmo critério de default-deny já
 * comprovado em Tool Registry (T3) e Job Registry (T5): jurisdição sem pack
 * registrado nunca vira regra genérica/zero, sempre `undefined` explícito.
 */
afterEach(() => {
  _resetCountryPackRegistryParaTeste();
});

function packFake(id: string): CountryPack {
  return { id, nome: `Pack de teste ${id}` };
}

describe("CountryPack registry — default-deny", () => {
  it("jurisdição sem pack registrado devolve undefined — nunca uma regra inventada", () => {
    expect(obterCountryPack("PT")).toBeUndefined();
  });

  it("nenhum Country Pack real vem pré-registrado (nem PT, nem BR) — confirma que esta rodada não implementou regra fiscal concreta", () => {
    expect(obterCountryPack("PT")).toBeUndefined();
    expect(obterCountryPack("BR")).toBeUndefined();
    expect(listarCountryPacks()).toHaveLength(0);
  });

  it("registrar e depois obter devolve o mesmo pack", () => {
    const pack = packFake("XX");
    registrarCountryPack(pack);
    expect(obterCountryPack("XX")).toBe(pack);
  });

  it("registrar duas vezes o mesmo id lança erro — nunca sobrescreve silenciosamente", () => {
    registrarCountryPack(packFake("XX"));
    expect(() => registrarCountryPack(packFake("XX"))).toThrow(/já registrado/);
  });

  it("listarCountryPacks reflete todos os packs registrados", () => {
    registrarCountryPack(packFake("AA"));
    registrarCountryPack(packFake("BB"));
    expect(listarCountryPacks().map((p) => p.id).sort()).toEqual(["AA", "BB"]);
  });
});

describe("CountryPack contract — métodos são opcionais (nenhuma regra fiscal concreta exigida)", () => {
  it("um pack pode existir sem implementar calcularImposto/documentosObrigatorios/validarLegalEntity", () => {
    const pack: CountryPack = { id: "ZZ", nome: "Pack mínimo" };
    registrarCountryPack(pack);
    const obtido = obterCountryPack("ZZ")!;
    expect(obtido.calcularImposto).toBeUndefined();
    expect(obtido.documentosObrigatorios).toBeUndefined();
    expect(obtido.validarLegalEntity).toBeUndefined();
  });
});
