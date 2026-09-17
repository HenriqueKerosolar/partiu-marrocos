// Separado de session.ts (que importa "server-only" + Prisma) porque
// middleware.ts roda em Edge Runtime e só pode importar módulos "leves".
export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "partiumarrocos_session";
