import { NextRequest, NextResponse } from "next/server";
import { prisma, obterSecret, submeterJob } from "@partiumarrocos/db";
import { findWhatsappAccountByPhoneNumberId, findWhatsappAccountByVerifyToken } from "@partiumarrocos/db";
import { assinaturaValida, downloadCloudMedia } from "@/lib/whatsapp/cloud-api";
import { ingestWhatsappMessage, updateWhatsappMessageStatus } from "@/lib/whatsapp/ingest";
import { gerarRespostaYalla } from "@/lib/ai/yalla";
import { subirMidia } from "@/lib/translation/storage";
import "@/lib/jobs"; // registra os job types (whatsapp.enviar_mensagem, translation.*) antes do primeiro submeterJob

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook da Meta Cloud API — multi-tenant desde o dia 1. Porte adaptado do
 * KeroSolar CRM (`src/app/api/whatsapp/webhook/route.ts`, auditoria seção 4).
 * Diferença estrutural chave: lá a conta é resolvida direto (single-tenant);
 * aqui a conta precisa ser resolvida via busca cross-tenant (`rls_bypass`)
 * ANTES de saber o tenant — mesmo padrão já usado no login (ver
 * cross-tenant.ts). O HMAC é validado com o `appSecret` DA CONTA encontrada,
 * nunca de uma variável global.
 *
 * NÃO repete a falha achada na auditoria (seção 5) no webhook Meta FB/IG do
 * KeroSolar (sem validação de assinatura) — aqui toda mensagem passa por
 * `assinaturaValida` antes de qualquer processamento.
 */

// GET: a Meta valida o webhook batendo aqui com hub.verify_token.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");
  if (mode !== "subscribe" || !token) return new NextResponse("forbidden", { status: 403 });

  const account = await findWhatsappAccountByVerifyToken(prisma, token);
  if (!account) return new NextResponse("forbidden", { status: 403 });

  return new NextResponse(challenge ?? "", { status: 200 });
}

type WaMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  video?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

export async function POST(req: NextRequest) {
  const raw = await req.text();

  let body: { entry?: Array<{ changes?: Array<{ field?: string; value?: Record<string, unknown> }> }> };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change.value ?? {};
        if (change?.field !== "messages") continue;

        const metadata = value.metadata as { phone_number_id?: string } | undefined;
        const phoneNumberId = metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Resolve a conta (cross-tenant) ANTES de qualquer outra coisa — é
        // só a partir daqui que sabemos o tenant e o appSecret certo pra
        // validar a assinatura.
        const account = await findWhatsappAccountByPhoneNumberId(prisma, phoneNumberId);
        if (!account) {
          console.warn("[whatsapp webhook] phone_number_id desconhecido, ignorando:", phoneNumberId);
          continue;
        }

        const appSecret = account.appSecretSecretRef
          ? await obterSecret(prisma, {
              tenantId: account.tenantId,
              secretRef: account.appSecretSecretRef,
              actorType: "SISTEMA",
              actorLabel: "whatsapp-webhook",
            })
          : null;

        if (!(await assinaturaValida(raw, req.headers.get("x-hub-signature-256"), appSecret))) {
          console.warn("[whatsapp webhook] assinatura inválida para conta", account.id);
          continue;
        }

        // PM-TRANSLATE-01: carregado uma vez por lote — só usado se alguma
        // mensagem deste lote for áudio/imagem/documento (ver abaixo).
        const accessTokenParaMidia = await obterSecret(prisma, {
          tenantId: account.tenantId,
          secretRef: account.accessTokenSecretRef,
          actorType: "SISTEMA",
          actorLabel: "whatsapp-webhook",
        });

        // Status de entrega (delivered/read/failed)
        const statuses = value.statuses as Array<{ id: string; status: string }> | undefined;
        if (statuses?.length) {
          for (const st of statuses) {
            if (!st.id) continue;
            if (st.status === "delivered" || st.status === "read" || st.status === "failed") {
              await updateWhatsappMessageStatus(account.tenantId, st.id, st.status);
            }
          }
        }

        const msgs = (value.messages as WaMessage[] | undefined) ?? [];
        if (!msgs.length) continue;

        const contacts = value.contacts as Array<{ profile?: { name?: string } }> | undefined;
        const nomeContato = contacts?.[0]?.profile?.name;

        for (const m of msgs) {
          const from = (m.from || "").replace(/\D/g, "");
          if (!from) continue;

          let texto = "";
          let mediaUrl: string | null = null;
          let mediaType: string | null = null;
          if (m.type === "text") texto = m.text?.body ?? "";
          else if (m.type === "button") texto = m.button?.text ?? "";
          else if (m.type === "interactive") texto = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
          else if (m.type === "audio" || m.type === "image" || m.type === "document") {
            // PM-TRANSLATE-01: baixa e hospeda no Blob (a URL da Meta expira
            // rápido) — áudio vai pro job de transcrição/tradução; imagem e
            // documento ficam só como anexo visível no /inbox (sem OCR/
            // tradução de conteúdo visual, fora de escopo). Vídeo continua
            // como placeholder "[video]": anexar vídeo com legenda/dublagem
            // traduzida é um projeto de processamento de vídeo à parte, não
            // decidido ainda (ver plano) — não baixa nem tenta transcrever.
            texto = `[${m.type}]`;
            const media = m.audio ?? m.image ?? m.document;
            if (media?.id && accessTokenParaMidia) {
              const baixado = await downloadCloudMedia(media.id, accessTokenParaMidia);
              if (baixado) {
                try {
                  mediaUrl = await subirMidia(`whatsapp/${m.id}`, baixado.buffer, baixado.mimeType);
                  mediaType = m.type;
                } catch (e) {
                  console.error("[whatsapp webhook] falha ao hospedar mídia recebida:", e);
                }
              }
            }
          } else if (m.type === "video") {
            texto = "[video]"; // ver comentário acima — vídeo fica fora desta rodada
          } else {
            continue; // tipos não tratados (location, contacts, reaction, etc.)
          }

          const result = await ingestWhatsappMessage({
            account,
            fromPhone: from,
            contactName: nomeContato,
            texto,
            externalMessageId: m.id ?? null,
            mediaUrl,
            mediaType,
          });

          if (result.duplicate) {
            console.log("[whatsapp webhook] mensagem duplicada ignorada:", m.id);
            continue;
          }

          // PM-TRANSLATE-01: transcreve (se áudio) e traduz pro idioma do
          // tenant, assíncrono — o job é silencioso se o tenant não tiver
          // provedor de IA configurado (mesmo padrão fail-closed do Yalla).
          if (result.messageId) {
            try {
              await submeterJob(prisma, {
                tenantId: account.tenantId,
                type: "translation.processar_mensagem_entrada",
                payload: { messageId: result.messageId },
                idempotencyKey: `translation-entrada-${m.id}`,
                priority: 5,
                source: "whatsapp-webhook",
                actorType: "SISTEMA",
                actorLabel: "whatsapp-webhook",
              });
            } catch (e) {
              console.error("[whatsapp webhook] falha ao enfileirar tradução:", e);
            }
          }

          // Resposta automática do Yalla — só se a conversa tem IA ligada
          // (padrão true, mas o operador pode desligar por lead, mesmo
          // mecanismo do KeroSolar/aiEnabled) e o tenant tem provider
          // configurado (ver lib/ai/yalla.ts — silencioso se não tiver).
          //
          // O ENVIO em si não acontece mais aqui de forma síncrona (T5):
          // antes, uma falha transitória de rede na Cloud API perdia a
          // resposta do Yalla pra sempre (só um `console.error`). Agora
          // enfileira um Job (`whatsapp.enviar_mensagem`) — o worker
          // (`pnpm --filter web worker`) processa com retry/backoff.
          // `idempotencyKey` correlaciona com o id da mensagem recebida da
          // Meta — redelivery do mesmo webhook nunca enfileira duas
          // respostas (defesa em profundidade; `ingestWhatsappMessage` já
          // filtra isso mais cedo via `result.duplicate`).
          if (result.aiEnabled) {
            const resposta = await gerarRespostaYalla(account.tenantId, result.conversationId);
            if (resposta) {
              try {
                await submeterJob(prisma, {
                  tenantId: account.tenantId,
                  type: "whatsapp.enviar_mensagem",
                  payload: { conversationId: result.conversationId, texto: resposta, senderType: "IA" },
                  idempotencyKey: `yalla-reply-${m.id}`,
                  priority: 10,
                  source: "whatsapp-webhook-yalla",
                  actorType: "AGENTE",
                  actorLabel: "yalla",
                });
              } catch (e) {
                console.error("[whatsapp webhook] falha ao enfileirar resposta do Yalla:", e);
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("[whatsapp webhook] erro:", e);
  }

  return NextResponse.json({ ok: true });
}
