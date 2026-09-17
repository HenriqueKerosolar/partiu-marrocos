import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma, withTenant, type PermissionKey } from "@partiumarrocos/db";
import { signSessionToken, verifySessionToken } from "./jwt";
import { SESSION_COOKIE } from "./session-constants";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

export interface AuthContext {
  sessionId: string;
  user: { id: string; email: string; mustChangePassword: boolean };
  tenantId: string | null;
  role: { id: string; nome: string } | null;
  permissions: Set<PermissionKey>;
}

/**
 * Cria a sessão (registro no banco + JWT assinado). Não seta cookie — quem
 * chama decide como (NextResponse em route handlers). Porte do CongáOne.
 */
export async function createSession(
  userId: string,
): Promise<{ sessionId: string; token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.session.create({
    data: { userId, expiraEm: expiresAt },
  });
  const token = await signSessionToken({ sid: session.id, uid: userId }, expiresAt);
  return { sessionId: session.id, token, expiresAt };
}

export async function setSessionTenant(sessionId: string, tenantId: string): Promise<void> {
  // Sessions não tem RLS (ver schema.prisma) — acesso sempre por chave primária.
  await prisma.session.update({ where: { id: sessionId }, data: { tenantId } });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { revogadoEm: new Date() } });
}

/**
 * Carrega o contexto de autenticação/autorização a partir do cookie da
 * requisição atual. Roda em Node (nunca no middleware/Edge) porque precisa do
 * Prisma. Fail-closed: qualquer inconsistência retorna `null` em vez de um
 * contexto parcial/otimista. Porte do CongáOne (session multi-tenant real,
 * revogável, com permissões derivadas fresh a cada request — não confia em
 * claims de papel embutidos no JWT).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const session = await prisma.session.findUnique({ where: { id: claims.sid } });
  if (!session || session.userId !== claims.uid) return null;
  if (session.revogadoEm || session.expiraEm.getTime() < Date.now()) return null;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ATIVO") return null;

  const base: AuthContext = {
    sessionId: session.id,
    user: { id: user.id, email: user.email, mustChangePassword: user.mustChangePassword },
    tenantId: null,
    role: null,
    permissions: new Set(),
  };

  if (!session.tenantId) return base;

  const membership = await withTenant(prisma, session.tenantId, (tx) =>
    tx.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: session.tenantId! } },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    }),
  );

  // Sessão aponta pra um tenant do qual o usuário não é (mais) membro —
  // trata como "sem tenant selecionado", nunca como erro que libera acesso.
  if (!membership) return base;

  return {
    ...base,
    tenantId: session.tenantId,
    role: { id: membership.role.id, nome: membership.role.nome },
    permissions: new Set(membership.role.rolePermissions.map((rp) => rp.permission.chave as PermissionKey)),
  };
}

/** Para Server Components/páginas: redireciona por padrão em vez de renderizar acesso parcial. */
export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.user.mustChangePassword) redirect("/trocar-senha");
  if (!ctx.tenantId) redirect("/selecionar-empresa");
  return ctx;
}
