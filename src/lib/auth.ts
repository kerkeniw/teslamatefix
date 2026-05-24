import fs from "node:fs";
import path from "node:path";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
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
 *
 * Détection du force-password-change : si le flag est présent, on redirige
 * la requête vers `/change-password` (next-intl middleware ajoutera la
 * locale). Deux cas où il NE FAUT PAS rediriger :
 *  1. La page `/change-password` elle-même (elle utilise `isAuthenticated()`,
 *     n'appelle pas cette fonction).
 *  2. La server action `changePasswordAction` qui DOIT pouvoir tourner
 *     pour effectuer le changement → passer `{ skipPasswordChangeRedirect: true }`.
 *
 * Tentative de détection du pathname pour le cas 1 via le header `next-url`,
 * mais c'est best-effort : en server action POST le header peut être absent
 * ou pointer vers un endpoint interne. D'où le param explicite pour le cas 2.
 */
export async function requireSession(
  options: { skipPasswordChangeRedirect?: boolean } = {},
): Promise<Required<Session>> {
  const session = await getSession();
  if (!session.userId || !session.loggedInAt) {
    throw new Error("Unauthorized");
  }
  if (!options.skipPasswordChangeRedirect && isPasswordChangeRequired()) {
    const pathname = await currentPathname();
    if (!/\/change-password(?:\/|$)/.test(pathname)) {
      redirect("/change-password");
    }
  }
  return session as Required<Session>;
}

/**
 * Pathname courant accessible depuis un RSC. Next.js expose `next-url` dans
 * les headers entrants pour les server components — c'est documenté comme
 * stable depuis Next 14. Si l'header n'existe pas, on retourne "" (la
 * redirection sera tentée, c'est le défaut sûr).
 */
async function currentPathname(): Promise<string> {
  try {
    const h = await headers();
    const next = h.get("next-url") ?? h.get("x-invoke-path") ?? "";
    // next-url contient parfois la URL complète ; on isole le pathname.
    if (next.startsWith("http")) {
      try {
        return new URL(next).pathname;
      } catch {
        return next;
      }
    }
    return next;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Lecture à chaud des credentials. La source de vérité bascule entre :
//   1. variables d'env (AUTH_USERNAME, AUTH_PASSWORD_HASH) — utile en CI,
//      dev local avec .env, ou setups headless rétrocompat v0.1.0 ;
//   2. fichiers dans env.SECRETS_DIR (`username`, `password_hash`) — mode
//      par défaut depuis v0.2.0, bootstrappé par l'entrypoint Docker au
//      premier démarrage et mis à jour par la page /change-password.
//
// On relit à chaque appel pour que la rotation du hash après changement
// de mot de passe soit prise en compte sans redémarrer le container.
// Le coût est négligeable : un read sync de ~60 octets, opération rare
// (uniquement lors d'un login).
// ---------------------------------------------------------------------------

const USERNAME_FILE = path.join(env.SECRETS_DIR, "username");
const PASSWORD_HASH_FILE = path.join(env.SECRETS_DIR, "password_hash");
const FORCE_CHANGE_FLAG = path.join(env.SECRETS_DIR, "force_password_change");

function readFileTrimmed(file: string): string | null {
  try {
    const content = fs.readFileSync(file, "utf8").trim();
    return content || null;
  } catch {
    return null;
  }
}

export function getCurrentUsername(): string {
  const fromEnv = process.env.AUTH_USERNAME;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  const fromFile = readFileTrimmed(USERNAME_FILE);
  if (fromFile) return fromFile;
  // Fallback ultime : "admin" (le cas où l'entrypoint n'a pas tourné).
  return "admin";
}

export function getCurrentPasswordHash(): string {
  const fromEnv = process.env.AUTH_PASSWORD_HASH;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  const fromFile = readFileTrimmed(PASSWORD_HASH_FILE);
  if (fromFile) return fromFile;
  throw new Error(
    `[teslamatefix] Mot de passe non configuré — ni AUTH_PASSWORD_HASH en env, ` +
      `ni fichier ${PASSWORD_HASH_FILE}. L'entrypoint Docker devrait bootstrapper ` +
      `un hash par défaut au premier démarrage.`,
  );
}

/**
 * `true` si l'utilisateur doit être redirigé vers /change-password après
 * login. C'est le cas tant que l'entrypoint a laissé en place le flag
 * `force_password_change` (créé lors du bootstrap initial avec le hash
 * de "admin").
 *
 * Si `AUTH_PASSWORD_HASH` est défini en env (mode legacy v0.1.0), on
 * considère que l'utilisateur a maîtrisé son hash : pas de force-change.
 */
export function isPasswordChangeRequired(): boolean {
  if (process.env.AUTH_PASSWORD_HASH && process.env.AUTH_PASSWORD_HASH.trim() !== "") {
    return false;
  }
  return fs.existsSync(FORCE_CHANGE_FLAG);
}

/**
 * Écrit le nouveau hash dans `env.SECRETS_DIR/password_hash` et supprime
 * le flag `force_password_change`. Mode 600 (lecture/écriture user seulement).
 *
 * Si `AUTH_PASSWORD_HASH` est défini en env (legacy), on **n'écrit pas**
 * le fichier — l'env vars resterait prioritaire au prochain redémarrage et
 * supprimerait silencieusement le changement. À la place, on lance une
 * erreur explicite pour pousser l'utilisateur à retirer la var d'env.
 */
export function persistPasswordHash(hash: string): void {
  if (process.env.AUTH_PASSWORD_HASH && process.env.AUTH_PASSWORD_HASH.trim() !== "") {
    throw new Error(
      `[teslamatefix] AUTH_PASSWORD_HASH est défini en env (mode legacy). ` +
        `Pour changer le mot de passe via l'UI, retirer la var d'env du container ` +
        `et redémarrer — l'entrypoint utilisera alors le hash persistant.`,
    );
  }
  fs.writeFileSync(PASSWORD_HASH_FILE, hash + "\n", { mode: 0o600 });
  try {
    fs.rmSync(FORCE_CHANGE_FLAG, { force: true });
  } catch {
    // best-effort : si le flag n'existe pas, rien à supprimer.
  }
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
 * Vérifie le couple (username, password) contre les credentials courants
 * (env > fichier). Retourne true en cas de succès. Toujours appeler
 * bcrypt.compare même quand le username est faux pour limiter le
 * timing-leak. Le username est comparé en temps constant via
 * crypto.timingSafeEqual.
 */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const expectedUsername = getCurrentUsername();
  const userMatch = constantTimeEqual(username, expectedUsername);
  // Si le user ne match pas, on hash un dummy pour garder un timing constant.
  const hash = userMatch
    ? getCurrentPasswordHash()
    : "$2b$12$0000000000000000000000.0000000000000000000000000000000";
  const passOk = await bcrypt.compare(password, hash);
  return userMatch && passOk;
}

export async function login(): Promise<void> {
  // Defense-in-depth contre la session fixation : on détruit toute session
  // pré-existante avant d'écrire les nouveaux champs.
  const existing = await getSession();
  existing.destroy();
  const session = await getSession();
  session.userId = getCurrentUsername();
  session.loggedInAt = Date.now();
  await session.save();
}

export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
