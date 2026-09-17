import { NextResponse } from "next/server";
import { getAuthContext, revokeSession, SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const ctx = await getAuthContext();
  if (ctx) await revokeSession(ctx.sessionId);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", expires: new Date(0) });
  return response;
}
