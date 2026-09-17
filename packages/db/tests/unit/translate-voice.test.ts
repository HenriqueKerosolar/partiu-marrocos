import { describe, expect, it } from "vitest";
import { obterTranslationProvider, obterVoiceProvider } from "../../src/i18n";

/**
 * PM-CONV-05, Track D — sem provider real de tradução/voz configurado
 * nesta rodada. A garantia que importa: nunca finge sucesso — sempre
 * recusa explicitamente com PROVIDER_NAO_CONFIGURADO, nunca inventa uma
 * tradução/áudio.
 */
describe("Translation provider — sem provider configurado", () => {
  it("recusa explicitamente, preservando o texto original", async () => {
    const provider = obterTranslationProvider();
    const r = await provider.traduzir("Bom dia, a viagem começa dia 10.", "en");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("PROVIDER_NAO_CONFIGURADO");
    expect(r.original).toBe("Bom dia, a viagem começa dia 10.");
    expect(r.traducao).toBeNull();
  });
});

describe("Voice provider — sem provider configurado", () => {
  it("recusa transcrição explicitamente, nunca inventa texto", async () => {
    const provider = obterVoiceProvider();
    const r = await provider.transcrever("base64-fake-audio");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("PROVIDER_NAO_CONFIGURADO");
    expect(r.texto).toBeNull();
  });

  it("recusa síntese explicitamente, nunca inventa áudio", async () => {
    const provider = obterVoiceProvider();
    const r = await provider.sintetizar("Olá!", "pt-BR");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("PROVIDER_NAO_CONFIGURADO");
    expect(r.audioBase64).toBeNull();
  });
});
