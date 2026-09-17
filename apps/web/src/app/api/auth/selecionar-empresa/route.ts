import { NextResponse } from "next/server";
import { prisma, getMembershipsForUser } from "@partiumarrocos/db";
import { getAuthContext, setSessionTenant } from "@/lib/session";

export async function POST(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
  if (!tenantId) return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });

  const memberships = await getMembershipsForUser(prisma, ctx.user.id);
  const pertence = memberships.some((m) => m.tenantId === tenantId);
  if (!pertence) {
    return NextResponse.json({ error: "Você não pertence a esta empresa." }, { status: 403 });
  }

  await setSessionTenant(ctx.sessionId, tenantId);

  const redirectTo = ctx.user.mustChangePassword ? "/trocar-senha" : "/dashboard";
  return NextResponse.json({ redirectTo });
}
