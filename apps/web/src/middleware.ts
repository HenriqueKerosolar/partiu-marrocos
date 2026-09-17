import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "./lib/jwt";
import { SESSION_COOKIE } from "./lib/session-constants";

/**
 * Roda em Edge Runtime — não tem acesso ao Postgres (Prisma não funciona em
 * Edge aqui). Por isso este middleware só faz uma checagem leve e rápida
 * (assinatura/expiração do JWT) para redirecionar cedo o caso óbvio de "sem
 * sessão". A checagem autoritativa — sessão revogada no banco, tenant válido,
 * permissão da rota — é feita em `lib/session.ts`/`lib/api-helpers.ts`, que
 * rodam em Node dentro de cada página/route handler. Nunca tratar a passagem
 * por este middleware como prova de autorização (essa confusão já causou uma
 * falha real de segurança em outro projeto da casa — ver
 * KeroIA Estética/src/middleware.ts, corrigido na mesma sessão que criou
 * este arquivo). Porte do CongáOne.
 */

// PM-CONV-05, Track B — /minha-viagem é a área do passageiro: acesso via
// credencial opaca na própria URL (?token=...), nunca via sessão de login
// (o passageiro não é um `User`). Segurança vem do token em si (hash
// SHA-256 comparado no banco, RLS por tenant), não deste middleware —
// mesmo modelo de "link de cartão de embarque" de uma companhia aérea.
const PUBLIC_PATHS = ["/login", "/minha-viagem", "/universo-amazigh", "/sabores-do-marrocos"];

// Fotos do site público servidas como estático de public/img/*.jpg — o
// matcher abaixo cobre qualquer request (não só páginas), então sem essa
// exceção um visitante anônimo pedindo /img/logo.png seria redirecionado
// pro /login em vez de receber a imagem.
const PUBLIC_SITE_PATH_PREFIXES = ["/img/"];

// Rotas verdadeiramente públicas por design (ex.: apps/web/src/app/api/
// public/leads/route.ts — captura de lead do site público, sem sessão,
// chamada de outro domínio). Achado real: até esta correção, o middleware
// devolvia 401 pra QUALQUER chamada aqui (inclusive o preflight OPTIONS de
// CORS), mesmo a rota em si já tendo sido escrita pra não exigir sessão —
// o formulário do site nunca conseguiria gravar um lead. Cada rota sob
// este prefixo continua responsável pela própria validação (rate limit,
// tenant, input) — "pública" aqui é só "sem cookie de sessão", nunca "sem
// controle nenhum".
//
// PM-PRE-GOLIVE-MASTER-01 — achado real em produção: `/api/health` (sem
// sessão por design, ver route.ts) e `/api/webhooks/` (validação própria via
// HMAC — a Meta nunca envia cookie de sessão) devolviam 401 aqui ANTES de
// chegar nas próprias rotas, que já foram escritas pra rodar sem sessão.
// Mascarado em todo teste anterior porque eu sempre testava logado (cookie
// de sessão válido, então o middleware deixava passar por acidente) — só
// apareceu numa chamada de verdade sem sessão (o cenário real de um
// monitor externo ou da própria Meta).
const PUBLIC_API_PATH_PREFIXES = ["/api/public/", "/api/health", "/api/webhooks/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname === "/" ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    PUBLIC_SITE_PATH_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/auth/login") ||
    PUBLIC_API_PATH_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  if (!claims) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
