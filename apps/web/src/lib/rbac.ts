import type { PermissionKey } from "@partiumarrocos/db";
import type { AuthContext } from "./session";

export class ForbiddenError extends Error {
  constructor(permission: PermissionKey) {
    super(`Permissão negada: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/** Nega por padrão: sem contexto de tenant ou sem a permissão explícita, `false`. */
export function hasPermission(ctx: AuthContext, permission: PermissionKey): boolean {
  return ctx.tenantId !== null && ctx.permissions.has(permission);
}

/** Para uso em route handlers de API: lança `ForbiddenError` (o caller converte em 403). */
export function requirePermission(ctx: AuthContext, permission: PermissionKey): void {
  if (!hasPermission(ctx, permission)) {
    throw new ForbiddenError(permission);
  }
}
