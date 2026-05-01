import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import bcrypt from "bcryptjs";
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

/**
 * Vérifie le couple (username, password) contre AUTH_USERNAME/AUTH_PASSWORD_HASH.
 * Retourne true en cas de succès. Toujours appeler bcrypt.compare même quand
 * le username est faux pour limiter le timing-leak.
 */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const userMatch = username === env.AUTH_USERNAME;
  // Si le user ne match pas, on hash un dummy pour garder un timing constant.
  const hash = userMatch
    ? env.AUTH_PASSWORD_HASH
    : "$2b$12$0000000000000000000000.0000000000000000000000000000000";
  const passOk = await bcrypt.compare(password, hash);
  return userMatch && passOk;
}

export async function login(): Promise<void> {
  const session = await getSession();
  session.userId = env.AUTH_USERNAME;
  session.loggedInAt = Date.now();
  await session.save();
}

export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
