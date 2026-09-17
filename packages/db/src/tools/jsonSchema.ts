import { z } from "zod";

/**
 * Conversor mínimo Zod → JSON Schema — cobre só os construtores que as
 * definições de tool desta rodada usam (object/string/number/boolean/enum/
 * array/optional/refine). Não é um conversor genérico de propósito: existe
 * pra declarar `inputSchema` no formato que Anthropic/OpenAI exigem pra
 * tool/function calling (T3 §18), sem depender do formato proprietário de
 * nenhum dos dois. Se uma tool futura precisar de um construtor Zod novo,
 * estender aqui explicitamente — nunca um fallback que finja suportar.
 */
export function zodParaJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as { typeName: string } & Record<string, unknown>;

  if (schema instanceof z.ZodOptional) {
    return zodParaJsonSchema((def.innerType as z.ZodTypeAny) ?? schema.unwrap());
  }
  if (schema instanceof z.ZodEffects) {
    return zodParaJsonSchema(def.schema as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodParaJsonSchema(value);
      if (!ehOpcional(value)) required.push(key);
    }
    return { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false };
  }
  if (schema instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: "string" };
    for (const check of (def.checks as Array<{ kind: string; value?: unknown }>) ?? []) {
      if (check.kind === "min") out.minLength = check.value;
      if (check.kind === "max") out.maxLength = check.value;
      if (check.kind === "email") out.format = "email";
      if (check.kind === "datetime") out.format = "date-time";
    }
    return out;
  }
  if (schema instanceof z.ZodNumber) {
    const out: Record<string, unknown> = { type: "number" };
    for (const check of (def.checks as Array<{ kind: string; value?: unknown }>) ?? []) {
      if (check.kind === "int") out.type = "integer";
      if (check.kind === "min") out.minimum = check.value;
      if (check.kind === "max") out.maximum = check.value;
    }
    return out;
  }
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: def.values };
  if (schema instanceof z.ZodArray) return { type: "array", items: zodParaJsonSchema(def.type as z.ZodTypeAny) };
  if (schema instanceof z.ZodRecord) return { type: "object" };

  // Fallback conservador (nunca deveria bater aqui com os schemas atuais) —
  // deixa o campo sem restrição declarada em vez de fingir suportar algo
  // que este conversor não conhece.
  return {};
}

function ehOpcional(schema: z.ZodTypeAny): boolean {
  return schema.isOptional();
}
