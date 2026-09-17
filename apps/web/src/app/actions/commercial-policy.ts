"use server";

import { revalidatePath } from "next/cache";
import { prisma, atualizarPoliticaComercial } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

export async function atualizarPoliticaComercialAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "politica_comercial.manage");

  const parse = (campo: string) => {
    const raw = String(formData.get(campo) ?? "").trim();
    if (!raw) return undefined;
    return Number(raw) / 100; // formulário mostra porcentagem (ex.: 15), gravamos fração (0.15)
  };

  const r = await atualizarPoliticaComercial(prisma, {
    tenantId: ctx.tenantId!,
    limites: {
      limiteDescontoRelevante: parse("limiteDescontoRelevante"),
      limiteMudancaPrecoExcepcional: parse("limiteMudancaPrecoExcepcional"),
      limiteMargemMinima: parse("limiteMargemMinima"),
    },
    actorType: "HUMANO",
    userId: ctx.user.id,
    actorLabel: ctx.user.email,
  });
  revalidatePath("/politica-comercial");
  if (!r.ok) return { error: "Valores inválidos — cada limite precisa ser uma porcentagem entre 0 (exclusive) e 100." };
  return { ok: true };
}
