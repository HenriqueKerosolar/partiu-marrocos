import { describe, expect, it } from "vitest";
import {
  resolverAjuda,
  rotasSemHelpKeyRegistrado,
  localesComConteudoProprio,
  HELP_ROUTES,
  HELP_KEYS,
  HELP_CONTENT,
  HELP_LOCALES,
} from "../../src/help";

/**
 * PM-CONV-04, Track B — Help System. Cobre §13B do comando: helpKey
 * existente, fallback, locale inexistente, rotas sem helpKey (deve ser 0),
 * e as rotas novas com helpKey presente.
 *
 * PM-CONV-06, Track D adicionou a asserção "rotas com locale incompleto =
 * 0" (todas as rotas de `HELP_ROUTES` têm conteúdo PRÓPRIO — não só via
 * fallback — nos 5 `HELP_LOCALES`), espelhando o mesmo espírito do §27
 * ("rotas sem help key = 0") aplicado a cobertura de idioma. Os testes de
 * fallback que antes dependiam de uma rota de produção ainda incompleta
 * (documentos.overview em pt-PT, jobs.overview em fr) agora constroem seu
 * próprio gap temporário em HELP_CONTENT, porque depois de PM-CONV-06 não
 * sobra nenhuma rota real incompleta para servir de exemplo — e a lógica de
 * fallback continua existindo (rede de segurança) e precisa continuar
 * testada.
 */

describe("Help — toda rota navegável tem helpKey registrado (§27: rotas sem help key = 0)", () => {
  it("nenhuma rota do registro está sem conteúdo de ajuda", () => {
    expect(rotasSemHelpKeyRegistrado()).toEqual([]);
  });

  it("HELP_KEYS não tem duplicados", () => {
    expect(new Set(HELP_KEYS).size).toBe(HELP_KEYS.length);
  });

  it("toda rota registrada tem pelo menos PT-BR", () => {
    for (const r of HELP_ROUTES) {
      expect(localesComConteudoProprio(r.helpKey)).toContain("pt-BR");
    }
  });
});

describe("Help — cobertura de locale completa (PM-CONV-06: rotas com locale incompleto = 0)", () => {
  it("toda rota registrada tem conteúdo PRÓPRIO (sem depender de fallback) nos 5 HELP_LOCALES", () => {
    const incompletas: { rota: string; helpKey: string; faltando: string[] }[] = [];

    for (const r of HELP_ROUTES) {
      const presentes = localesComConteudoProprio(r.helpKey);
      const faltando = HELP_LOCALES.filter((l) => !presentes.includes(l));
      if (faltando.length > 0) {
        incompletas.push({ rota: r.rota, helpKey: r.helpKey, faltando });
      }
    }

    expect(incompletas).toEqual([]);
  });
});

describe("Help — resolução com fallback previsível (§9B)", () => {
  it("retorna o conteúdo exato quando o locale pedido existe", () => {
    const c = resolverAjuda("leads.list", "en");
    expect(c?.titulo).toBe("Leads");
  });

  it("pt-PT sem conteúdo próprio cai em pt-BR", () => {
    // Gap construído sob demanda: depois de PM-CONV-06 nenhuma rota real
    // fica sem pt-PT, então simulamos uma aqui em vez de apontar para uma
    // rota de produção (que deixaria de existir e quebraria o teste).
    const key = "__teste__.fallback.pt-PT";
    HELP_CONTENT[key] = { "pt-BR": { titulo: "Só PT-BR", objetivo: "x", quemUsa: "x" } };
    try {
      const c = resolverAjuda(key, "pt-PT");
      expect(c).not.toBeNull();
      expect(c?.titulo).toBe("Só PT-BR");
    } finally {
      delete HELP_CONTENT[key];
    }
  });

  it("locale totalmente ausente cai em EN e depois PT-BR — nunca null pra uma chave existente", () => {
    const key = "__teste__.fallback.fr";
    HELP_CONTENT[key] = { "pt-BR": { titulo: "x", objetivo: "x", quemUsa: "x" }, en: { titulo: "Only EN", objetivo: "x", quemUsa: "x" } };
    try {
      const c = resolverAjuda(key, "fr"); // não tem fr — deve cair em EN
      expect(c).not.toBeNull();
      expect(c?.titulo).toBe("Only EN");
    } finally {
      delete HELP_CONTENT[key];
    }
  });

  it("helpKey inexistente retorna null — nunca expõe a chave crua", () => {
    const c = resolverAjuda("chave.que.nao.existe", "pt-BR");
    expect(c).toBeNull();
  });

  it("rotas novas do PM-CONV-04 têm conteúdo em todos os 5 locales", () => {
    for (const key of ["checkin.overview", "parceiros.overview", "premiacoes.overview", "ouvidoria.list"]) {
      for (const locale of ["pt-BR", "pt-PT", "en", "es", "fr"] as const) {
        const c = resolverAjuda(key, locale);
        expect(c, `${key} / ${locale}`).not.toBeNull();
      }
    }
  });
});
