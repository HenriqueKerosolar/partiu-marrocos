import { NextResponse } from "next/server";
import { getAuthContext, type AuthContext } from "./session";
import { ForbiddenError, requirePermission } from "./rbac";
import type { PermissionKey } from "@partiumarrocos/db";

/**
 * Para route handlers de API: exige sessão válida, senha já trocada, tenant
 * selecionado e (quando informado) a permissão indicada. Nega por padrão —
 * qualquer passo que falhar retorna a Response de erro, nunca segue adiante.
 * Porte do CongáOne (packages/db/src/api-helpers.ts).
 */
export async function requireApiContext(
  permission?: PermissionKey,
): Promise<{ ctx: AuthContext } | { error: NextResponse }> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }
  if (ctx.user.mustChangePassword) {
    return { error: NextResponse.json({ error: "Troca de senha obrigatória." }, { status: 403 }) };
  }
  if (!ctx.tenantId) {
    return { error: NextResponse.json({ error: "Nenhuma empresa selecionada." }, { status: 403 }) };
  }
  if (permission) {
    try {
      requirePermission(ctx, permission);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return { error: NextResponse.json({ error: err.message }, { status: 403 }) };
      }
      throw err;
    }
  }
  return { ctx };
}
