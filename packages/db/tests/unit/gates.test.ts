import { describe, expect, it } from "vitest";
import { transicaoValida } from "../../src/gates";
import type { GateStatus } from "@prisma/client";

const TODOS: GateStatus[] = ["PENDENTE", "APROVADO", "REJEITADO", "MODIFICADO", "EXPIRADO"];

describe("transicaoValida — máquina de estados do Gate (pura, sem banco)", () => {
  it("PENDENTE aceita os 4 destinos válidos", () => {
    expect(transicaoValida("PENDENTE", "APROVADO")).toBe(true);
    expect(transicaoValida("PENDENTE", "REJEITADO")).toBe(true);
    expect(transicaoValida("PENDENTE", "MODIFICADO")).toBe(true);
    expect(transicaoValida("PENDENTE", "EXPIRADO")).toBe(true);
  });

  it("PENDENTE não permite transição para si mesmo", () => {
    expect(transicaoValida("PENDENTE", "PENDENTE")).toBe(false);
  });

  it("nenhum estado terminal (APROVADO/REJEITADO/MODIFICADO/EXPIRADO) permite nenhuma transição — nem de volta pra PENDENTE, nem entre si", () => {
    const terminais: GateStatus[] = ["APROVADO", "REJEITADO", "MODIFICADO", "EXPIRADO"];
    for (const de of terminais) {
      for (const para of TODOS) {
        expect(transicaoValida(de, para)).toBe(false);
      }
    }
  });
});
