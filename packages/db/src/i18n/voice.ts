/**
 * PM-CONV-05, Track D — provider abstraction para STT/TTS (voz).
 *
 * BLOQUEADO nesta rodada: nenhuma credencial de provider de voz (STT/TTS)
 * foi fornecida. A arquitetura fica pronta (interface abaixo) mas a única
 * implementação é `SemProvedorVoiceProvider`, que recusa explicitamente —
 * nunca simula transcrição/síntese de voz (proibido pelo comando: "STT/TTS
 * somente com integração real; se credencial/provider faltar, deixar
 * arquitetura pronta e declarar bloqueio").
 *
 * Quando um provider real for contratado (ex.: Whisper/ElevenLabs/Azure
 * Speech), a integração entra como uma nova classe implementando
 * `VoiceProvider` — nenhuma mudança na UI ou no restante do Yalla.
 */

export interface TranscricaoResultado {
  ok: boolean;
  texto: string | null;
  idiomaDetectado: string | null;
  motivo?: "PROVIDER_NAO_CONFIGURADO" | "FALHA_PROVIDER";
}

export interface SinteseResultado {
  ok: boolean;
  audioBase64: string | null;
  motivo?: "PROVIDER_NAO_CONFIGURADO" | "FALHA_PROVIDER";
}

export interface VoiceProvider {
  nome: string;
  transcrever(audioBase64: string): Promise<TranscricaoResultado>;
  sintetizar(texto: string, idioma: string): Promise<SinteseResultado>;
}

class SemProvedorVoiceProvider implements VoiceProvider {
  nome = "sem_provedor";
  async transcrever(): Promise<TranscricaoResultado> {
    return { ok: false, texto: null, idiomaDetectado: null, motivo: "PROVIDER_NAO_CONFIGURADO" };
  }
  async sintetizar(): Promise<SinteseResultado> {
    return { ok: false, audioBase64: null, motivo: "PROVIDER_NAO_CONFIGURADO" };
  }
}

export function obterVoiceProvider(): VoiceProvider {
  return new SemProvedorVoiceProvider();
}
