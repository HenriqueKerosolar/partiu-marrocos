import { NextResponse } from "next/server";
import { prisma, withTenant, submeterJob } from "@partiumarrocos/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import "@/lib/jobs"; // registra translation.processar_mensagem_entrada antes do submeterJob abaixo

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Canal WEBCHAT (chat flutuante do site público) — ativa
 * `ConversationChannel.WEBCHAT`, que já existia no schema mas nunca tinha
 * sido implementado. Visitante anônimo não tem telefone/e-mail: a
 * identidade é um `visitorId` (UUID) gerado no navegador (localStorage) na
 * primeira abertura do widget — a `Conversation.externalId` guarda esse
 * valor, então visitas seguintes do mesmo navegador reencontram a mesma
 * conversa (mesmo padrão de `externalId` já usado pro WhatsApp, só que ali
 * é o id da mensagem na Meta).
 *
 * Sem sessão exigida (mesmo padrão de api/public/leads) — rate limit por IP
 * é a defesa real aqui.
 */
const ALLOWED_ORIGIN = process.env.PUBLIC_SITE_ORIGIN || "*";

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

async function resolverConversa(tenantSlug: string, visitorId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return null;

  return withTenant(prisma, tenant.id, async (tx) => {
    let conversation = await tx.conversation.findFirst({
      where: { tenantId: tenant.id, channel: "WEBCHAT", externalId: visitorId },
    });
    if (!conversation) {
      const contact = await tx.contact.create({
        data: { tenantId: tenant.id, nome: "Visitante do site", origem: "webchat" },
      });
      conversation = await tx.conversation.create({
        data: { tenantId: tenant.id, contactId: contact.id, channel: "WEBCHAT", externalId: visitorId },
      });
    }
    return { tenantId: tenant.id, conversationId: conversation.id };
  });
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`public-webchat:${ip}`, 30, 10 * 60_000);
  if (!rl.allowed) {
    return cors(NextResponse.json({ error: "Muitas mensagens, aguarde um pouco." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }));
  }

  let body: { tenantSlug?: string; visitorId?: string; texto?: string; mediaUrl?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return cors(NextResponse.json({ error: "JSON inválido." }, { status: 400 }));
  }

  const tenantSlug = String(body.tenantSlug ?? "").trim();
  const visitorId = String(body.visitorId ?? "").trim();
  const texto = String(body.texto ?? "").trim();
  const mediaUrl = body.mediaUrl ? String(body.mediaUrl).trim() : null;
  const mediaType = body.mediaType ? String(body.mediaType).trim() : null;

  if (!tenantSlug || !visitorId || (!texto && !mediaUrl)) {
    return cors(NextResponse.json({ error: "Informe tenantSlug, visitorId e uma mensagem ou anexo." }, { status: 400 }));
  }
  if (texto.length > 4000) return cors(NextResponse.json({ error: "Mensagem muito longa." }, { status: 400 }));
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(visitorId)) return cors(NextResponse.json({ error: "visitorId inválido." }, { status: 400 }));

  const resolvido = await resolverConversa(tenantSlug, visitorId);
  if (!resolvido) return cors(NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 }));
  const { tenantId, conversationId } = resolvido;

  const messageId = await withTenant(prisma, tenantId, async (tx) => {
    const message = await tx.message.create({
      data: {
        tenantId,
        conversationId,
        direction: "ENTRADA",
        senderType: "CONTATO",
        conteudo: texto || `[${mediaType ?? "anexo"}]`,
        mediaUrl,
        mediaType,
      },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return message.id;
  });

  try {
    await submeterJob(prisma, {
      tenantId,
      type: "translation.processar_mensagem_entrada",
      payload: { messageId },
      idempotencyKey: `translation-entrada-webchat-${messageId}`,
      priority: 5,
      source: "webchat",
      actorType: "SISTEMA",
      actorLabel: "webchat",
    });
  } catch (e) {
    console.error("[webchat] falha ao enfileirar tradução:", e);
  }

  return cors(NextResponse.json({ ok: true, conversationId, messageId }, { status: 201 }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenantSlug")?.trim() ?? "";
  const visitorId = url.searchParams.get("visitorId")?.trim() ?? "";
  const desde = url.searchParams.get("desde");

  if (!tenantSlug || !visitorId) return cors(NextResponse.json({ error: "Informe tenantSlug e visitorId." }, { status: 400 }));
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(visitorId)) return cors(NextResponse.json({ error: "visitorId inválido." }, { status: 400 }));

  const ip = getClientIp(req);
  const rl = await rateLimit(`public-webchat-poll:${ip}`, 120, 10 * 60_000);
  if (!rl.allowed) return cors(NextResponse.json({ error: "Muitas requisições." }, { status: 429 }));

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return cors(NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 }));

  const mensagens = await withTenant(prisma, tenant.id, async (tx) => {
    const conversation = await tx.conversation.findFirst({ where: { tenantId: tenant.id, channel: "WEBCHAT", externalId: visitorId } });
    if (!conversation) return [];
    return tx.message.findMany({
      where: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        ...(desde ? { createdAt: { gt: new Date(desde) } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  });

  return cors(
    NextResponse.json({
      mensagens: mensagens.map((m) => ({
        id: m.id,
        direction: m.direction,
        conteudo: m.conteudo,
        translatedConteudo: m.translatedConteudo,
        detectedLanguage: m.detectedLanguage,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
        translatedMediaUrl: m.translatedMediaUrl,
        translatedMediaType: m.translatedMediaType,
        createdAt: m.createdAt,
      })),
    }),
  );
}
