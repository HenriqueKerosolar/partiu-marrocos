import "server-only";
import { prisma, withTenant, type WhatsappAccount } from "@partiumarrocos/db";

/**
 * Motor de ingestão de mensagem WhatsApp — porte adaptado do KeroSolar CRM
 * (`src/lib/crm/engine.ts::ingestMessage`, auditoria seção 6, classificado D
 * "usar como referência" / C "extrair com reescrita"). A FORMA é a mesma
 * (contato → conversa → mensagem, dedup por externalId, reabre conversa
 * resolvida quando o contato escreve de novo); a diferença estrutural é que
 * aqui TUDO roda dentro de `withTenant(account.tenantId, ...)` — no KeroSolar
 * não há tenant nenhum, é essa lacuna que motivou reescrever em vez de copiar.
 */
export interface IngestWhatsappInput {
  account: WhatsappAccount;
  fromPhone: string;
  contactName?: string;
  texto: string;
  externalMessageId: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
}

export interface IngestResult {
  conversationId: string;
  messageId: string | null;
  duplicate: boolean;
  aiEnabled: boolean;
}

export async function ingestWhatsappMessage(input: IngestWhatsappInput): Promise<IngestResult> {
  const { account, fromPhone, contactName, texto, externalMessageId, mediaUrl, mediaType } = input;
  const whatsappId = fromPhone.replace(/\D/g, "");

  return withTenant(prisma, account.tenantId, async (tx) => {
    // Dedup real por constraint de banco (@@unique([tenantId, externalId])) —
    // achado da auditoria KeroSolar seção 4: lá é só findFirst antes de criar,
    // sem constraint, com uma pequena janela de corrida. Aqui a checagem prévia
    // é só uma saída rápida; a garantia de verdade é o unique do schema.
    if (externalMessageId) {
      const existente = await tx.message.findUnique({
        where: { tenantId_externalId: { tenantId: account.tenantId, externalId: externalMessageId } },
      });
      if (existente) {
        const conv = await tx.conversation.findUnique({ where: { id: existente.conversationId } });
        return { conversationId: existente.conversationId, messageId: existente.id, duplicate: true, aiEnabled: conv?.aiEnabled ?? false };
      }
    }

    let contact = await tx.contact.findUnique({
      where: { tenantId_whatsappId: { tenantId: account.tenantId, whatsappId } },
    });
    if (!contact) {
      contact = await tx.contact.create({
        data: { tenantId: account.tenantId, nome: contactName || whatsappId, whatsappId, telefone: whatsappId, origem: "whatsapp" },
      });
    } else if (contactName && contact.nome === contact.whatsappId) {
      // nome ainda não capturado da primeira mensagem — atualiza com o profile name da Meta
      contact = await tx.contact.update({ where: { id: contact.id }, data: { nome: contactName } });
    }

    let conversation = await tx.conversation.findUnique({
      where: { tenantId_channel_contactId: { tenantId: account.tenantId, channel: "WHATSAPP", contactId: contact.id } },
    });
    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          tenantId: account.tenantId,
          contactId: contact.id,
          accountId: account.id,
          channel: "WHATSAPP",
          lastMessageAt: new Date(),
        },
      });
    } else {
      conversation = await tx.conversation.update({
        where: { id: conversation.id },
        // resolvedAt: null reabre a conversa se o contato escreveu de novo (mesma regra do KeroSolar, seção 6).
        data: { lastMessageAt: new Date(), resolvedAt: null, accountId: account.id },
      });
    }

    const message = await tx.message.create({
      data: {
        tenantId: account.tenantId,
        conversationId: conversation.id,
        direction: "ENTRADA",
        senderType: "CONTATO",
        conteudo: texto,
        externalId: externalMessageId,
        mediaUrl: mediaUrl ?? null,
        mediaType: mediaType ?? null,
      },
    });

    return { conversationId: conversation.id, messageId: message.id, duplicate: false, aiEnabled: conversation.aiEnabled };
  });
}

/** Atualiza status de entrega (delivered/read/failed) de uma mensagem de saída, por externalId. */
export async function updateWhatsappMessageStatus(
  tenantId: string,
  externalId: string,
  status: "delivered" | "read" | "failed",
): Promise<void> {
  await withTenant(prisma, tenantId, async (tx) => {
    const data =
      status === "delivered"
        ? { deliveredAt: new Date() }
        : status === "read"
          ? { readAt: new Date(), deliveredAt: new Date() }
          : { failedReason: "meta_rejeitou" };
    await tx.message.updateMany({ where: { tenantId, externalId }, data }).catch(() => {});
  });
}
