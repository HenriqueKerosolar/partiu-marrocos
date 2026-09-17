"use server";

import { revalidatePath } from "next/cache";
import { prisma, salvarPolitica, removerPolitica, type CostPolicyEscopo, type CostPolicyPeriodo } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

const ESCOPOS_VALIDOS: CostPolicyEscopo[] = ["TENANT", "PROVIDER", "MODEL", "CAPABILITY", "AGENT"];
const PERIODOS_VALIDOS: CostPolicyPeriodo[] = ["POR_CHAMADA", "DIARIO", "MENSAL"];

/** Cria/atualiza um limite de custo técnico/IA do tenant. Só Administrador por padrão (cost.manage). */
export async function salvarPoliticaCusto(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "cost.manage");

  const escopo = String(formData.get("escopo") ?? "");
  const escopoValor = String(formData.get("escopoValor") ?? "").trim();
  const periodo = String(formData.get("periodo") ?? "");
  const limite = String(formData.get("limite") ?? "").trim();
  const moeda = String(formData.get("moeda") ?? "USD").trim() || "USD";
  const alertaPercentual = String(formData.get("alertaPercentual") ?? "80").trim();

  if (!ESCOPOS_VALIDOS.includes(escopo as CostPolicyEscopo)) return { error: "Escopo inválido." };
  if (!PERIODOS_VALIDOS.includes(periodo as CostPolicyPeriodo)) return { error: "Período inválido." };
  if (escopo !== "TENANT" && !escopoValor) return { error: "Informe o valor do escopo (ex.: nome do provider/model/agente)." };
  if (!limite || Number.isNaN(Number(limite)) || Number(limite) < 0) return { error: "Informe um limite numérico não-negativo." };

  try {
    await salvarPolitica(prisma, {
      tenantId: ctx.tenantId!,
      escopo: escopo as CostPolicyEscopo,
      escopoValor,
      periodo: periodo as CostPolicyPeriodo,
      limite,
      moeda,
      alertaPercentual,
      actorType: "HUMANO",
      userId: ctx.user.id,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao salvar a política." };
  }

  revalidatePath("/custos");
  return { ok: true };
}

/** Remove um limite de custo. Só Administrador por padrão (cost.manage). */
export async function removerPoliticaCusto(politicaId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "cost.manage");

  const removeu = await removerPolitica(prisma, { tenantId: ctx.tenantId!, politicaId, actorType: "HUMANO", userId: ctx.user.id });
  if (!removeu) return { error: "Política não encontrada." };

  revalidatePath("/custos");
  return { ok: true };
}
