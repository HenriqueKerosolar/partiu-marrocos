"use server";

import { resolverAjuda, type HelpContent } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";

/**
 * PM-CONV-04, Track B — locale de exibição da ajuda. Sem preferência de
 * idioma por usuário ainda (não inventada aqui) — usa PT-BR, mesmo idioma
 * de trabalho do resto da interface hoje. O mecanismo de fallback em si já
 * suporta EN/PT-PT/ES/FR quando essa preferência existir no futuro.
 */
export async function buscarAjudaAction(helpKey: string): Promise<HelpContent | null> {
  await requireAuthContext();
  return resolverAjuda(helpKey, "pt-BR");
}

/**
 * Variante para as páginas do site público (visitante anônimo, sem sessão —
 * `requireAuthContext()` redirecionaria pro /login, o que quebraria o botão
 * de ajuda ali). Restrita por allowlist ("public." only): mesmo que alguém
 * chame a action direto com outra helpKey, nunca expõe conteúdo de ajuda do
 * app interno (rotas de staff) a um visitante não autenticado.
 */
const HELP_KEYS_PUBLICOS = new Set(["public.home", "public.amazigh", "public.sabores", "auth.login"]);

export async function buscarAjudaPublicaAction(helpKey: string): Promise<HelpContent | null> {
  if (!HELP_KEYS_PUBLICOS.has(helpKey)) return null;
  return resolverAjuda(helpKey, "pt-BR");
}
