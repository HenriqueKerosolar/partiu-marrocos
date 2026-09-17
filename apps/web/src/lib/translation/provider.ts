import { gerarResposta, AiProviderError, type ChatMessage } from "../ai/provider";

/**
 * Provedor de tradução (STT/tradução de texto/TTS) — mesmo estilo de
 * `ai/provider.ts` (timeout via AbortController, erro tipado com
 * `transiente`). A tradução de TEXTO reaproveita `gerarResposta` (o modelo
 * já é multilíngue nativo, mesma decisão do Yalla — ver ai/yalla.ts:45-49);
 * STT e TTS usam os endpoints de áudio da OpenAI diretamente, porque
 * `gerarResposta` só cobre chat completions.
 *
 * `selecionarProvider` hoje sempre devolve OpenAI (único configurado). Serve
 * de seam pra quando o ElevenLabs entrar: essa função ganha uma tabela de
 * custo por tarefa e escolhe o mais barato — nenhum código fora dela muda.
 */

export interface TranslationProvider {
  transcrever(audio: Buffer, mimeType: string): Promise<{ texto: string; idioma: string }>;
  /** Detecta o idioma original E traduz numa única chamada (mais barato que duas). */
  traduzir(texto: string, idiomaDestino: string): Promise<{ traducao: string; idiomaOrigem: string; inputTokens?: number; outputTokens?: number }>;
  sintetizar(texto: string, idioma: string): Promise<{ buffer: Buffer; mimeType: string }>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

async function fetchComTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extensaoPara(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  return "m4a";
}

export class OpenAiTranslationProvider implements TranslationProvider {
  constructor(private readonly apiKey: string) {}

  async transcrever(audio: Buffer, mimeType: string): Promise<{ texto: string; idioma: string }> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), `audio.${extensaoPara(mimeType)}`);
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");

    const res = await fetchComTimeout(
      "https://api.openai.com/v1/audio/transcriptions",
      { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}` }, body: form },
      DEFAULT_TIMEOUT_MS,
    );
    if (!res.ok) throw new AiProviderError(res.status, await res.text().catch(() => ""));
    const data = (await res.json()) as { text?: string; language?: string };
    return { texto: data.text ?? "", idioma: normalizarIdioma(data.language) };
  }

  async traduzir(texto: string, idiomaDestino: string): Promise<{ traducao: string; idiomaOrigem: string; inputTokens?: number; outputTokens?: number }> {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `Detecte o idioma do texto do usuário e traduza para "${idiomaDestino}". Responda APENAS com um JSON válido no formato {"idiomaOrigem":"<código>","traducao":"<texto traduzido>"} — nenhum texto antes ou depois do JSON. Códigos possíveis pra idiomaOrigem: "pt-BR" (português do Brasil), "pt-PT" (português de Portugal), ou o código de 2 letras pra qualquer outro idioma (en, es, fr, de, it...). Se o texto estiver em português, DISTINGA Brasil de Portugal pelo vocabulário/gramática (ex.: "você" vs "tu", "ônibus" vs "autocarro", "celular" vs "telemóvel", "trem" vs "comboio") — nunca devolva só "pt" genérico. Se o texto já estiver no idioma de destino pedido, "traducao" deve ser o próprio texto, sem alterações — mas se o destino é "pt-BR" e o texto está em "pt-PT" (ou vice-versa), ADAPTE o vocabulário e a gramática pra variante de destino, não é o mesmo idioma pra este fim.`,
      },
      { role: "user", content: texto },
    ];
    const resposta = await gerarResposta({ provider: "openai", apiKey: this.apiKey, model: "gpt-4o-mini" }, messages);
    return { ...parseTraducao(resposta.texto, texto), inputTokens: resposta.usage.inputTokens, outputTokens: resposta.usage.outputTokens };
  }

  async sintetizar(texto: string, idioma: string): Promise<{ buffer: Buffer; mimeType: string }> {
    void idioma; // a voz da OpenAI já lê o texto no idioma em que ele está escrito — nada a configurar por idioma aqui.
    const res = await fetchComTimeout(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "tts-1", voice: "alloy", input: texto, response_format: "mp3" }),
      },
      DEFAULT_TIMEOUT_MS,
    );
    if (!res.ok) throw new AiProviderError(res.status, await res.text().catch(() => ""));
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mimeType: "audio/mpeg" };
  }
}

/** Extrai {idiomaOrigem,traducao} da resposta do modelo — nunca lança se o JSON vier malformado: devolve o texto original como fallback (nunca perde a mensagem por causa de uma resposta mal formatada). */
function parseTraducao(respostaModelo: string, textoOriginal: string): { traducao: string; idiomaOrigem: string } {
  try {
    const match = respostaModelo.match(/\{[\s\S]*\}/);
    const data = JSON.parse(match ? match[0] : respostaModelo) as { idiomaOrigem?: string; traducao?: string };
    if (typeof data.traducao === "string" && data.traducao.trim()) {
      return { traducao: data.traducao, idiomaOrigem: normalizarCodigoIdioma(data.idiomaOrigem) };
    }
  } catch {
    // resposta não veio em JSON — cai no fallback abaixo.
  }
  return { traducao: textoOriginal, idiomaOrigem: IDIOMA_PADRAO };
}

export const IDIOMA_PADRAO = "pt-BR";

/**
 * Normaliza o código de idioma devolvido pelo modelo — preserva a variante
 * completa pra português ("pt-BR"/"pt-PT", pedido do usuário: "preciso
 * português de portugal e português brasil"), reduz pra 2 letras pra
 * qualquer outro idioma (en/es/fr/de/it...). Nunca trunca "pt-BR" pra "pt".
 */
function normalizarCodigoIdioma(codigo?: string): string {
  if (!codigo) return IDIOMA_PADRAO;
  const c = codigo.trim().toLowerCase();
  if (c.startsWith("pt-br") || c === "pt_br" || c === "ptbr") return "pt-BR";
  if (c.startsWith("pt-pt") || c === "pt_pt" || c === "ptpt") return "pt-PT";
  if (c === "pt" || c === "portuguese" || c === "português") return IDIOMA_PADRAO; // sem variante clara — assume o padrão do tenant
  return c.slice(0, 2);
}

/**
 * Whisper devolve nomes de idioma por extenso (ex. "portuguese") e NUNCA
 * distingue a variante BR/PT a partir do áudio — só o texto transcrito
 * permite essa distinção (vocabulário/gramática). Por isso este valor é só
 * um palpite inicial; o job de tradução (translation-processar-mensagem)
 * sempre roda `traduzir()` depois, que reclassifica pt-BR/pt-PT a partir do
 * texto de verdade e sobrescreve este palpite.
 */
function normalizarIdioma(nome?: string): string {
  const mapa: Record<string, string> = {
    portuguese: IDIOMA_PADRAO,
    english: "en",
    spanish: "es",
    french: "fr",
    german: "de",
    italian: "it",
  };
  if (!nome) return IDIOMA_PADRAO;
  return mapa[nome.toLowerCase()] ?? nome.slice(0, 2).toLowerCase();
}

export type TranslationTask = "stt" | "translate" | "tts";

/** Hoje sempre OpenAI (único provedor com chave configurada). Quando o ElevenLabs entrar, escolhe por custo aqui — nenhum código fora desta função muda. */
export function selecionarProvider(_tarefa: TranslationTask, apiKey: string): TranslationProvider {
  return new OpenAiTranslationProvider(apiKey);
}
