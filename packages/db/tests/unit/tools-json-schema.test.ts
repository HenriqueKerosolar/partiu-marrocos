import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodParaJsonSchema } from "../../src/tools/jsonSchema";
import { leadMoverStageTool, tarefaCriarTool, notaRegistrarTool, leadAtualizarPreferenciasTool } from "../../src/tools";

describe("zodParaJsonSchema — conversão usada para declarar tools ao provider (T3 §18)", () => {
  it("objeto simples com campo obrigatório", () => {
    const schema = zodParaJsonSchema(z.object({ motivo: z.string().min(1).max(500) }));
    expect(schema).toEqual({ type: "object", properties: { motivo: { type: "string", minLength: 1, maxLength: 500 } }, required: ["motivo"], additionalProperties: false });
  });

  it("campo opcional nunca entra em 'required'", () => {
    const schema = zodParaJsonSchema(z.object({ a: z.string(), b: z.string().optional() })) as any;
    expect(schema.required).toEqual(["a"]);
  });

  it("enum vira string com lista de valores", () => {
    const schema = zodParaJsonSchema(z.enum(["QUENTE", "MORNO", "FRIO"]));
    expect(schema).toEqual({ type: "string", enum: ["QUENTE", "MORNO", "FRIO"] });
  });

  it("number com .int() vira integer, .positive()/.max() viram minimum/maximum", () => {
    const schema = zodParaJsonSchema(z.number().int().positive().max(100));
    expect(schema).toEqual({ type: "integer", minimum: 0, maximum: 100 });
  });

  it("objeto vazio (sem campos) — tool sem parâmetros", () => {
    expect(zodParaJsonSchema(z.object({}))).toEqual({ type: "object", properties: {}, additionalProperties: false });
  });

  it("converte de ponta a ponta os inputSchema reais das tools sem lançar exceção", () => {
    for (const tool of [leadMoverStageTool, tarefaCriarTool, notaRegistrarTool, leadAtualizarPreferenciasTool]) {
      const json = zodParaJsonSchema(tool.inputSchema);
      expect(json.type).toBe("object");
      expect(json).toHaveProperty("properties");
    }
  });

  it("tarefa.criar: dataHora (refine + optional) ainda vira string/date-time, sem quebrar a conversão", () => {
    const json = zodParaJsonSchema(tarefaCriarTool.inputSchema) as any;
    expect(json.properties.dataHora).toEqual({ type: "string", format: "date-time" });
    expect(json.required).not.toContain("dataHora");
  });
});
