import { NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { subirMidia } from "@/lib/translation/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload de anexo do chat flutuante (foto/documento) — hospeda no Vercel
 * Blob e devolve a URL, que o widget então manda pro POST principal de
 * `api/public/webchat` junto com a mensagem. Vídeo não é aceito aqui (fora
 * de escopo desta rodada — ver plano PM-TRANSLATE-01).
 */
const ALLOWED_ORIGIN = process.env.PUBLIC_SITE_ORIGIN || "*";
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const TAMANHO_MAX_BYTES = 10 * 1024 * 1024; // 10MB

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`public-webchat-upload:${ip}`, 20, 10 * 60_000);
  if (!rl.allowed) return cors(NextResponse.json({ error: "Muitos envios, aguarde um pouco." }, { status: 429 }));

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) return cors(NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 }));
  if (!TIPOS_ACEITOS.includes(file.type)) return cors(NextResponse.json({ error: "Tipo de arquivo não aceito (só imagem ou PDF)." }, { status: 400 }));
  if (file.size > TAMANHO_MAX_BYTES) return cors(NextResponse.json({ error: "Arquivo muito grande (máximo 10MB)." }, { status: 400 }));

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await subirMidia(`webchat/${Date.now()}-${file.name}`, buffer, file.type);
  const mediaType = file.type === "application/pdf" ? "document" : "image";

  return cors(NextResponse.json({ ok: true, url, mediaType }, { status: 201 }));
}
