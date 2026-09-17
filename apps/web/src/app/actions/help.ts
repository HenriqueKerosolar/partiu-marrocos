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
