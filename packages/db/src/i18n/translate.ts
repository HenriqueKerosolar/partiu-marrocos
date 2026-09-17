/**
 * PM-CONV-05, Track D — provider abstraction para tradução. Preserva
 * original + tradução + idioma (nunca substitui o texto original por
 * tradução silenciosa — quem chama decide o que mostrar).
 *
 * Nenhum provider real está configurado nesta rodada (nenhuma credencial
 * de serviço de tradução foi fornecida) — é proibido simular integração
 * externa (§ do comando), então a única implementação hoje é
 * `SemProvedorTranslationProvider`, que devolve `PROVIDER_NAO_CONFIGURADO`
 * de forma explícita. A conversa do Yalla em si não depende disto — o
 * modelo já responde nativamente no idioma do cliente (ver
 * apps/web/src/lib/ai/yalla.ts) — esta abstração serve para tradução
 * explícita de um texto específico (ex.: traduzir um roteiro cadastrado só
 * em PT para mostrar a um cliente EN), quando/se um provider real for
 * contratado.
 */

export interface TraducaoResultado {
  ok: boolean;
  original: string;
  idiomaOrigem: string | null; // detectado pelo provider, quando disponível
  traducao: string | null;
  idiomaDestino: string;
  motivo?: "PROVIDER_NAO_CONFIGURADO" | "FALHA_PROVIDER";
}

export interface TranslationProvider {
  nome: string;
  traduzir(texto: string, idiomaDestino: string): Promise<TraducaoResultado>;
}

class SemProvedorTranslationProvider implements TranslationProvider {
  nome = "sem_provedor";
  async traduzir(texto: string, idiomaDestino: string): Promise<TraducaoResultado> {
    return {
      ok: false,
      original: texto,
      idiomaOrigem: null,
      traducao: null,
      idiomaDestino,
      motivo: "PROVIDER_NAO_CONFIGURADO",
    };
  }
}

/** Ponto único de acesso — trocar de provider real no futuro é só mudar esta função, nunca espalhar `new XProvider()` pelo app. */
export function obterTranslationProvider(): TranslationProvider {
  return new SemProvedorTranslationProvider();
}
