/**
 * Proxy Next.js 16 (anciennement `middleware`).
 * Garde les routes protégées : redirige les requêtes non authentifiées vers /login.
 *
 * Routes publiques :
 *  - /login (et son server action POST)
 *  - /api/health (healthcheck Docker)
 *  - assets statiques (_next/*, favicon, etc., déjà exclus par le matcher)
 */
import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";

const PUBLIC_PATHS = new Set(["/login", "/api/health"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const session = await getIronSession<{ userId?: string }>(req, res, {
    password: process.env.AUTH_SECRET ?? "",
    cookieName: "teslamatefix_session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  });

  if (!session.userId) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques Next.js et les sources de monitoring
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)",
  ],
};
