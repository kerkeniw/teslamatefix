/**
 * Proxy Next.js 16 (anciennement `middleware`) : chaîne auth + i18n.
 *
 * Politique :
 *  - `/api/health` : public, pas d'auth.
 *  - `/api/*` autres : authentification requise (cookie iron-session).
 *  - `/_next/*`, assets statiques : exclus par le matcher.
 *  - Routes UI (`/login` y compris) : passent par next-intl pour la locale.
 *  - Routes UI hors `/login` : redirigent vers `/login` si non authentifié.
 */
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { getIronSession } from "iron-session";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

const SESSION_COOKIE = "teslamatefix_session";

async function readSession(req: NextRequest) {
  const res = NextResponse.next();
  return getIronSession<{ userId?: string }>(req, res, {
    password: process.env.AUTH_SECRET ?? "",
    cookieName: SESSION_COOKIE,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  });
}

function isLoginPath(pathname: string): boolean {
  // /login OU /<locale>/login (locale parmi `routing.locales`)
  if (pathname === "/login") return true;
  for (const l of routing.locales) {
    if (pathname === `/${l}/login`) return true;
  }
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Seul le healthcheck léger reste public (probe Docker liveness).
  // /api/health/db, qui ouvre une connexion Postgres, exige une session pour
  // ne pas révéler la disponibilité du backend à un attaquant non authentifié.
  //
  // /api/tesla-public-key sert la clé publique Tesla (validation domaine Fleet
  // API) : Tesla doit pouvoir la lire sans session. Cible du rewrite défini
  // dans next.config.ts pour /.well-known/appspecific/com.tesla.3p.public-key.pem.
  if (pathname === "/api/health" || pathname === "/api/tesla-public-key") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const session = await readSession(req);
    if (!session.userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return NextResponse.next();
  }

  if (isLoginPath(pathname)) {
    return intlMiddleware(req);
  }

  const session = await readSession(req);
  if (!session.userId) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(req);
}

export const config = {
  // Tout sauf assets statiques et fichiers avec extension (favicon, images…)
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
