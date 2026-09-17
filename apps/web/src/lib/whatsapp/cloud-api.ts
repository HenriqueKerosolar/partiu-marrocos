/**
 * Cliente da API OFICIAL do WhatsApp (Meta Cloud API). Porte adaptado do
 * KeroSolar CRM (`src/lib/crm/cloud-api.ts`, auditoria KEROSOLAR-CRM seção 4,
 * classificado A/B — reutilizar direto/adaptando). Única mudança estrutural:
 * lá as credenciais vêm de variável de ambiente global (single-tenant); aqui
 * vêm como parâmetro explícito (`accessToken` da `WhatsappAccount` do
 * tenant) — o resto da lógica (endpoints, normalização de telefone, janela
 * de 24h) é preservado porque já está validado em produção real.
 *
 * Sem `import "server-only"` de propósito (mesmo padrão de `apps/web/src/lib/jwt.ts`
 * herdado do CongáOne/fabricaease): o guard quebra o teste unitário direto no
 * Vitest, e este módulo não expõe nada de credencial embutida que precise da
 * proteção — as chamadas de rede exigem token passado por parâmetro.
 */

// PM-CONV-06, §5E — override só para teste: sob a fila global (T5), um job
// `whatsapp.enviar_mensagem`/`teste.whatsapp_timeout_curto` pode ser
// reivindicado e executado pelo processo/thread de QUALQUER arquivo de
// teste, não necessariamente o que o submeteu — um `vi.stubGlobal("fetch")`
// local só intercepta chamadas feitas DENTRO do próprio processo/thread que
// o declarou (ver `tests/setup/whatsapp-mock-server.ts`, que sobe um
// servidor HTTP real compartilhado e aponta esta variável pra ele antes dos
// workers do Vitest subirem). Em produção a variável nunca é definida — GRAPH
// continua sendo sempre a Cloud API real.
const GRAPH = process.env.WHATSAPP_GRAPH_BASE_URL ?? "https://graph.facebook.com/v23.0";

/** Telefone no formato da Cloud API: só dígitos, com DDI (ex.: 5521999998888). */
function normalizar(phone: string): string {
  const d = (phone || "").replace(/\D/g, "");
  return d.length <= 11 ? `55${d}` : d;
}

/** Código de erro Meta indicando janela de 24h fechada. */
export const META_ERROR_24H = 131026;

export class CloudApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly metaCode: number | null,
    msg: string,
  ) {
    super(msg);
    this.name = "CloudApiError";
  }
  get is24hWindow() {
    return this.metaCode === META_ERROR_24H;
  }
}

/**
 * T5-FIX §1: nunca assumir que `fetch` tem timeout por padrão — ele NÃO
 * tem (uma requisição pendurada esperaria pra sempre sem um `signal`
 * explícito). `signal` é opcional e propagado pelo chamador — o Job Engine
 * (`ctx.signal`, ver `packages/db/src/jobs/types.ts`) aborta de verdade
 * quando o timeout do job estoura; chamadores fora do contexto de job
 * (ex.: `responderWhatsapp`, envio manual do operador) continuam sem
 * signal, mesmo comportamento de antes.
 */
async function post(phoneNumberId: string, accessToken: string, body: object, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const metaCode: number | null = data?.error?.code ?? null;
    console.error("[whatsapp cloud-api] erro envio:", res.status, metaCode, JSON.stringify(data)?.slice(0, 300));
    throw new CloudApiError(res.status, metaCode, `cloud-api ${res.status} code:${metaCode}`);
  }
  return data?.messages?.[0]?.id ?? null;
}

/** Envia texto livre (só funciona dentro da janela de 24h da última msg do contato). `signal` (opcional) permite cancelamento real da conexão — ver nota em `post`. */
export async function sendCloudText(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  text: string,
  signal?: AbortSignal,
): Promise<string | null> {
  return post(
    phoneNumberId,
    accessToken,
    {
      to: normalizar(toPhone),
      type: "text",
      text: { body: text, preview_url: true },
    },
    signal,
  );
}

/** Envia mídia por URL pública (imagem/vídeo/documento/áudio). */
export async function sendCloudMedia(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  url: string,
  type: "image" | "video" | "document" | "audio",
  caption?: string,
): Promise<string | null> {
  const media: Record<string, string> = { link: url };
  if (caption && (type === "image" || type === "video")) media.caption = caption;
  if (type === "document" && caption) media.filename = caption;
  return post(phoneNumberId, accessToken, { to: normalizar(toPhone), type, [type]: media });
}

/**
 * Envia um TEMPLATE aprovado (HSM) — necessário FORA da janela de 24h.
 * `components` segue o formato da Cloud API. Use [] se o template não tem variáveis.
 */
export async function sendCloudTemplate(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  templateName: string,
  lang = "pt_BR",
  components: object[] = [],
): Promise<string | null> {
  return post(phoneNumberId, accessToken, {
    to: normalizar(toPhone),
    type: "template",
    template: { name: templateName, language: { code: lang }, ...(components.length ? { components } : {}) },
  });
}

/** Baixa uma mídia recebida (2 passos: pega a URL temporária pelo media id, depois os bytes). */
export async function downloadCloudMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!binRes.ok) return null;
    const buffer = Buffer.from(await binRes.arrayBuffer());
    return { buffer, mimeType: meta.mime_type || "application/octet-stream" };
  } catch (e) {
    console.error("[whatsapp cloud-api] download mídia falhou:", e);
    return null;
  }
}

/** Valida a assinatura X-Hub-Signature-256 (HMAC-SHA256 com o App Secret da conta, timing-safe). */
export async function assinaturaValida(raw: string, header: string | null, appSecret: string | null): Promise<boolean> {
  const { createHmac, timingSafeEqual } = await import("crypto");
  if (!appSecret) return process.env.NODE_ENV !== "production";
  if (!header) return false;
  const esperado = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
  try {
    const a = Buffer.from(esperado);
    const b = Buffer.from(header);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
