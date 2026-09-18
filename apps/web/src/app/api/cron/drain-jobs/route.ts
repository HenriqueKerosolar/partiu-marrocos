import { NextRequest, NextResponse } from "next/server";
import { drenarJobsPendentes } from "@/lib/jobs/drain";
import "@/lib/jobs"; // registra todos os job types antes de drenar

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rede de segurança do drain inline (ver lib/jobs/drain.ts): o drain que
 * roda dentro do webhook/ação só pega o job que aquele request acabou de
 * criar. Um job que caiu em RETRY_WAIT (backoff) só é reprocessado na
 * próxima vez que ALGO chamar drenarJobsPendentes — em tenants com pouco
 * tráfego isso pode demorar. Este cron (ver vercel.json) garante um
 * varredura periódica mesmo sem novo evento.
 *
 * Protegida pelo header que a própria Vercel Cron envia automaticamente
 * quando `CRON_SECRET` está configurado — mesma validação de posse de
 * segredo que o webhook da Meta faz via HMAC, só que aqui é bearer simples
 * (não há terceiro externo formatando a chamada).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const processados = await drenarJobsPendentes(50, 45_000);
  return NextResponse.json({ ok: true, processados });
}
