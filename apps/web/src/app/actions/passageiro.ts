"use server";

import { prisma, obterContextoPassageiro, registrarAvaliacaoPassageiro, type ContextoPassageiro } from "@partiumarrocos/db";
import { rateLimit, getClientIpFromRequestHeaders } from "@/lib/rate-limit";

const MOTIVOS: Record<string, string> = {
  FORMATO_INVALIDO: "Código inválido — confira o link e tente novamente.",
  NAO_ENCONTRADA: "Credencial não encontrada.",
  EXPIRADA: "Esta credencial expirou — peça uma nova à sua agência.",
  REVOGADA: "Esta credencial foi revogada — peça uma nova à sua agência.",
  VIAGEM_NAO_CONCLUIDA: "A avaliação fica disponível depois que a viagem é concluída.",
  NOTA_INVALIDA: "Nota inválida.",
  JA_AVALIADA: "Você já avaliou esta viagem.",
};

/**
 * PM-CONV-05, Track B — sem `requireAuthContext`: rota pública, a
 * credencial opaca É a autenticação (ver packages/db/src/passageiro.ts).
 *
 * PM-CONV-11 — achado real de auditoria de segurança: esta rota pública
 * não tinha nenhum rate limit (ao contrário de /api/auth/login e
 * /api/public/leads, que já usam o mesmo helper). A credencial em si já é
 * a defesa primária (hash de 48 hex chars aleatórios — espaço de busca
 * inviável), mas rate limit é defesa em profundidade barata contra
 * varredura automatizada, mesmo padrão já usado nas outras rotas públicas.
 */
export async function obterMinhaViagemAction(token: string): Promise<{ ok?: boolean; error?: string; contexto?: ContextoPassageiro }> {
  const ip = await getClientIpFromRequestHeaders();
  const rl = rateLimit(`minha-viagem:${ip}`, 20, 5 * 60_000);
  if (!rl.allowed) return { error: "Muitas tentativas — aguarde alguns minutos e tente novamente." };

  const r = await obterContextoPassageiro(prisma, token.trim());
  if (!r.ok) return { error: MOTIVOS[r.motivo] ?? "Não foi possível carregar sua viagem." };
  return { ok: true, contexto: r.contexto };
}

/** PM-CONV-10 — mesmo token do cartão de embarque, mesma revalidação a cada chamada; nunca aceita um bookingId do cliente. */
export async function registrarAvaliacaoAction(token: string, nota: number, comentario: string, depoimentoAutorizado: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ip = await getClientIpFromRequestHeaders();
  const rl = rateLimit(`minha-viagem-avaliar:${ip}`, 10, 5 * 60_000);
  if (!rl.allowed) return { error: "Muitas tentativas — aguarde alguns minutos e tente novamente." };

  const r = await registrarAvaliacaoPassageiro(prisma, token.trim(), { nota, comentario: comentario.trim() || null, depoimentoAutorizado });
  if (!r.ok) return { error: MOTIVOS[r.motivo] ?? "Não foi possível registrar sua avaliação." };
  return { ok: true };
}
