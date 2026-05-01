import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

export type Session = {
  userId?: string;
  loggedInAt?: number;
};

const sessionOptions: SessionOptions = {
  password: env.AUTH_SECRET,
  cookieName: "teslamatefix_session",
  ttl: 60 * 60 * 24 * 7, // 7 jours
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<Session>(cookieStore, sessionOptions);
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return Boolean(session.userId);
}

/**
 * Garde-fou pour les server actions / route handlers : lance si pas authentifié.
 * Dans les pages, préférer un redirect explicite via le proxy.
 */
export async function requireSession(): Promise<Required<Session>> {
  const session = await getSession();
  if (!session.userId || !session.loggedInAt) {
    throw new Error("Unauthorized");
  }
  return session as Required<Session>;
}

function constantTimeEqual(a: string, b: string): boolean {
  // timingSafeEqual exige des buffers de même taille — on padde côté plus court
  // avec des octets nuls, ce qui ne crée pas de faux positifs : si les longueurs
  // diffèrent, on retourne false avant le compare.
  if (a.length !== b.length) {
    // Toujours faire un compare factice pour ne pas révéler la longueur.
    timingSafeEqual(Buffer.from(a.padEnd(b.length, "\0")), Buffer.from(b));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Vérifie le couple (username, password) contre AUTH_USERNAME/AUTH_PASSWORD_HASH.
 * Retourne true en cas de succès. Toujours appeler bcrypt.compare même quand
 * le username est faux pour limiter le timing-leak. Le username est comparé
 * en temps constant via crypto.timingSafeEqual.
 */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const userMatch = constantTimeEqual(username, env.AUTH_USERNAME);
  // Si le user ne match pas, on hash un dummy pour garder un timing constant.
  const hash = userMatch
    ? env.AUTH_PASSWORD_HASH
    : "$2b$12$0000000000000000000000.0000000000000000000000000000000";
  const passOk = await bcrypt.compare(password, hash);
  return userMatch && passOk;
}

export async function login(): Promise<void> {
  // Defense-in-depth contre la session fixation : on détruit toute session
  // pré-existante avant d'écrire les nouveaux champs. Sans ce reset, un cookie
  // forgé à l'avance survivrait à la connexion (peu probable vu httpOnly +
  // chiffrement authentifié, mais c'est une couche standard à conserver).
  const existing = await getSession();
  existing.destroy();
  const session = await getSession();
  session.userId = env.AUTH_USERNAME;
  session.loggedInAt = Date.now();
  await session.save();
}

export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
