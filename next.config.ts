import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * En-têtes de sécurité globaux. CSP volontairement omise : Next 16 nécessite des
 * nonces dynamiques pour l'hydratation. À ajouter dans une itération dédiée
 * (avec nonce middleware) si l'app est exposée à des scripts non-fiables.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
] as const;

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders],
      },
    ];
  },
  /**
   * Mappe l'URL exacte exigée par Tesla pour la validation de domaine Fleet API
   * vers la route handler `src/app/api/tesla-public-key/route.ts`. Les points
   * littéraux du chemin sont échappés (`\\.`) car `source` est interprété en
   * path-to-regexp. La route cible est rendue publique dans `src/proxy.ts`.
   */
  async rewrites() {
    return [
      {
        source:
          "/\\.well-known/appspecific/com\\.tesla\\.3p\\.public-key\\.pem",
        destination: "/api/tesla-public-key",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
