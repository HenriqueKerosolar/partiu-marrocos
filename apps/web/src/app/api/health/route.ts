import { NextResponse } from "next/server";
import { prisma, obterSaudeFila } from "@partiumarrocos/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PM-CONV-11 — achado real de auditoria: nenhum endpoint de observabilidade
 * existia (confirmado por busca em toda `apps/web/src/app/api`). Rota
 * pública deliberada (sem `requireAuthContext`) — é o padrão de um health
 * check (monitoramento externo/Vercel precisa bater aqui sem sessão) — mas
 * nunca expõe nada sensível: só conectividade com o banco e saúde
 * agregada da fila de jobs (nenhum dado de tenant, nenhum segredo).
 */
export async function GET() {
  const inicio = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - inicio;

    let fila: { workersAtivos: number; jobsProntos: number } | null = null;
    try {
      const saude = await obterSaudeFila(prisma);
      fila = { workersAtivos: saude.workers.filter((w) => w.ativo).length, jobsProntos: saude.contagemGlobal.READY };
    } catch {
      // saúde da fila é informativa, não crítica pro health check em si —
      // uma falha aqui não deve derrubar o status geral "ok" do banco.
    }

    return NextResponse.json({ status: "ok", db: { connected: true, latencyMs: dbLatencyMs }, jobs: fila, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("[health] falha de conectividade com o banco:", e);
    return NextResponse.json({ status: "degraded", db: { connected: false }, timestamp: new Date().toISOString() }, { status: 503 });
  }
}
