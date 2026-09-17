import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma, getMembershipsForUser } from "@partiumarrocos/db";
import { createSession, setSessionTenant, SESSION_COOKIE } from "@/lib/session";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  // Rate limit por IP — mesma proteção do fabricaease, ausente no KeroSolar
  // CRM (achado da auditoria de reaproveitamento) e por isso aplicada aqui
  // desde o início.
  const { allowed, retryAfterSeconds } = await rateLimit(`login:${getClientIp(request)}`, 10, 5 * 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe email e senha." }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const { password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  const genericError = () => NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });

  if (!user || user.status !== "ATIVO") return genericError();

  const senhaOk = await bcrypt.compare(password, user.passwordHash);
  if (!senhaOk) return genericError();

  const memberships = await getMembershipsForUser(prisma, user.id);
  if (memberships.length === 0) {
    return NextResponse.json({ error: "Usuário sem empresa vinculada." }, { status: 403 });
  }

  const { sessionId, token, expiresAt } = await createSession(user.id);

  let redirectTo = "/selecionar-empresa";
  if (memberships.length === 1) {
    await setSessionTenant(sessionId, memberships[0]!.tenantId);
    redirectTo = user.mustChangePassword ? "/trocar-senha" : "/dashboard";
  }

  const response = NextResponse.json({ redirectTo });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
