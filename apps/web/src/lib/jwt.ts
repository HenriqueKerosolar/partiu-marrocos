import { SignJWT, jwtVerify } from "jose";

/**
 * Assinatura/verificação de JWT com `jose` (não `jsonwebtoken`) porque
 * `middleware.ts` roda em Edge Runtime, onde `jose` funciona e libs baseadas
 * em Node crypto clássico não. O middleware só faz esta verificação de
 * assinatura/expiração — a autorização de verdade (sessão revogada, tenant
 * válido, permissões) é decidida em `session.ts`, que roda em Node e acessa o
 * banco. Porte literal do CongáOne.
 */

export interface SessionClaims {
  sid: string;
  uid: string;
  [key: string]: unknown;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET não está definido no ambiente.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(claims: SessionClaims, expiresAt: Date): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sid !== "string" || typeof payload.uid !== "string") {
      return null;
    }
    return payload as SessionClaims;
  } catch {
    return null;
  }
}
