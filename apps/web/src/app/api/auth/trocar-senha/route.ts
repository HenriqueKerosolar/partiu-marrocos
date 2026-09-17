import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@partiumarrocos/db";
import { getAuthContext } from "@/lib/session";
import { recordAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const senhaAtual = typeof body?.senhaAtual === "string" ? body.senhaAtual : "";
  const novaSenha = typeof body?.novaSenha === "string" ? body.novaSenha : "";

  if (novaSenha.length < 8) {
    return NextResponse.json({ error: "A nova senha precisa ter ao menos 8 caracteres." }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  const senhaOk = await bcrypt.compare(senhaAtual, user.passwordHash);
  if (!senhaOk) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 401 });
  }

  const passwordHash = await bcrypt.hash(novaSenha, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  if (ctx.tenantId) {
    await recordAudit({
      tenantId: ctx.tenantId,
      userId: user.id,
      acao: "trocar_senha",
      entidade: "User",
      entidadeId: user.id,
      resultado: "SUCESSO",
    });
  }

  return NextResponse.json({ redirectTo: "/dashboard" });
}
