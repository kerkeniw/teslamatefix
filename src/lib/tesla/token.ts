import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { warnThrottled } from "@/lib/logger";
import { cloakDecrypt } from "./cloak";

/**
 * Récupère l'access token Tesla **en lecture seule** depuis la table `tokens`
 * gérée par TeslaMate, et le déchiffre avec la clé Cloak partagée.
 *
 * Contraintes (cf. plan v0.5.2) :
 *   - la table `tokens` est marquée `@@ignore` dans le schéma Prisma → on la lit
 *     via `$queryRaw`, jamais via le client typé, et on n'écrit JAMAIS dedans ;
 *   - selon la version de TeslaMate, `tokens` vit dans le schéma **`private`**
 *     (récent, pour ne pas l'exposer) ou `public` (ancien) → on résout le schéma
 *     dynamiquement et on qualifie la requête (le search_path est `public`) ;
 *   - on n'appelle JAMAIS l'endpoint de refresh : Tesla rotationne le refresh
 *     token à chaque refresh, ce qui casserait celui stocké par TeslaMate.
 *
 * Retourne `null` si la clé n'est pas configurée, si aucune ligne n'existe, si
 * le déchiffrement échoue ou si le jeton est **expiré** — jamais d'exception
 * propagée. Chaque cause est journalisée au plus toutes les 10 min (problème
 * persistant visible, sans inonder les logs : le repli `TESLA_VEHICLE_OPTIONS`
 * prend le relais à chaque rendu).
 */

// Schéma résolu mémorisé pour éviter une requête information_schema à chaque appel.
let resolvedSchema: string | null | undefined;

function warn(event: string, msg: string, extra?: Record<string, unknown>): void {
  warnThrottled(event, { event, ...extra }, msg);
}

/**
 * Date d'expiration (`exp`) d'un JWT, lue sans vérifier la signature (simple
 * diagnostic : c'est Tesla qui valide le jeton). `null` si illisible.
 */
export function jwtExpiry(token: string): Date | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload?.exp === "number" ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Trouve le schéma hébergeant la table `tokens` (préférence `private`, repli
 * `public`). Mémorise le résultat. Retourne `null` si la table est introuvable.
 */
async function resolveTokensSchema(): Promise<string | null> {
  if (resolvedSchema !== undefined) return resolvedSchema;
  try {
    const rows = await prisma.$queryRaw<Array<{ table_schema: string }>>`
      SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'tokens' AND table_schema IN ('private', 'public')
      ORDER BY (table_schema = 'private') DESC
      LIMIT 1
    `;
    resolvedSchema = rows[0]?.table_schema ?? null;
  } catch {
    resolvedSchema = null;
  }
  return resolvedSchema;
}

export async function getTeslaAccessToken(): Promise<string | null> {
  const key = env.TESLAMATE_ENCRYPTION_KEY;
  if (!key) {
    warn(
      "tesla.token.no_key",
      "TESLAMATE_ENCRYPTION_KEY absent — repli sur TESLA_VEHICLE_OPTIONS",
    );
    return null;
  }

  try {
    const schema = await resolveTokensSchema();
    if (!schema) {
      warn("tesla.token.no_table", "Table `tokens` introuvable (private/public)");
      return null;
    }
    // `schema` provient d'une liste blanche ({private, public}) → interpolation sûre.
    const rows = await prisma.$queryRawUnsafe<Array<{ access: Buffer | null }>>(
      `SELECT access FROM "${schema}".tokens ORDER BY id DESC LIMIT 1`,
    );
    const access = rows[0]?.access;
    if (!access || access.length === 0) {
      warn("tesla.token.empty", "Aucun access token Tesla en base");
      return null;
    }

    // Prisma renvoie le bytea en Buffer/Uint8Array selon le driver.
    const blob = Buffer.isBuffer(access) ? access : Buffer.from(access);
    const token = cloakDecrypt(blob, key);

    if (!token.startsWith("ey")) {
      // Un JWT Tesla commence par "ey" — sinon le déchiffrement a probablement
      // produit du binaire (mauvaise clé) sans lever d'erreur GCM.
      warn(
        "tesla.token.not_jwt",
        "Token déchiffré inattendu (pas un JWT) — vérifier TESLAMATE_ENCRYPTION_KEY",
      );
      return null;
    }

    // Jeton expiré : inutile d'appeler Tesla (401 assuré). TeslaMate le
    // rafraîchit lui-même (~8 h de validité) ; s'il ne l'est plus, TeslaMate est
    // arrêté, déconnecté de Tesla, ou la base vient d'une sauvegarde restaurée.
    const exp = jwtExpiry(token);
    if (exp && exp.getTime() <= Date.now()) {
      warn(
        "tesla.token.expired",
        "Jeton Tesla expiré : TeslaMate ne l'a pas rafraîchi (instance arrêtée, déconnectée de Tesla, ou base restaurée) — appels Fleet API suspendus, repli sur TESLA_VEHICLE_OPTIONS",
        {
          expired_at: exp.toISOString(),
          expired_since_min: Math.round((Date.now() - exp.getTime()) / 60_000),
        },
      );
      return null;
    }
    return token;
  } catch (err) {
    warn(
      "tesla.token.decrypt_error",
      "Échec lecture/déchiffrement du jeton Tesla — TESLAMATE_ENCRYPTION_KEY différente de l'ENCRYPTION_KEY de TeslaMate ? (penser à échapper les `$` en `\\$` dans .env)",
      { err: (err as Error).message },
    );
    return null;
  }
}
