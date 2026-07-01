import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
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
 * Retourne `null` si la clé n'est pas configurée, si aucune ligne n'existe, ou si
 * le déchiffrement échoue — jamais d'exception propagée. L'échec est loggué **une
 * seule fois par process** (le repli `TESLA_VEHICLE_OPTIONS` prend le relais à
 * chaque rendu, inutile de spammer les logs).
 */

// Schéma résolu mémorisé pour éviter une requête information_schema à chaque appel.
let resolvedSchema: string | null | undefined;
// N'avertir qu'une fois par process pour chaque cause d'échec.
const warned = new Set<string>();

function warnOnce(event: string, msg: string, extra?: Record<string, unknown>): void {
  if (warned.has(event)) return;
  warned.add(event);
  logger.warn({ event, ...extra }, msg);
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
    warnOnce(
      "tesla.token.no_key",
      "TESLAMATE_ENCRYPTION_KEY absent — repli sur TESLA_VEHICLE_OPTIONS",
    );
    return null;
  }

  try {
    const schema = await resolveTokensSchema();
    if (!schema) {
      warnOnce("tesla.token.no_table", "Table `tokens` introuvable (private/public)");
      return null;
    }
    // `schema` provient d'une liste blanche ({private, public}) → interpolation sûre.
    const rows = await prisma.$queryRawUnsafe<Array<{ access: Buffer | null }>>(
      `SELECT access FROM "${schema}".tokens ORDER BY id DESC LIMIT 1`,
    );
    const access = rows[0]?.access;
    if (!access || access.length === 0) {
      warnOnce("tesla.token.empty", "Aucun access token Tesla en base");
      return null;
    }

    // Prisma renvoie le bytea en Buffer/Uint8Array selon le driver.
    const blob = Buffer.isBuffer(access) ? access : Buffer.from(access);
    const token = cloakDecrypt(blob, key);

    if (!token.startsWith("ey")) {
      // Un JWT Tesla commence par "ey" — sinon le déchiffrement a probablement
      // produit du binaire (mauvaise clé) sans lever d'erreur GCM.
      warnOnce(
        "tesla.token.not_jwt",
        "Token déchiffré inattendu (pas un JWT) — vérifier TESLAMATE_ENCRYPTION_KEY",
      );
      return null;
    }
    return token;
  } catch (err) {
    warnOnce("tesla.token.decrypt_error", "Échec lecture/déchiffrement du token Tesla", {
      err: (err as Error).message,
    });
    return null;
  }
}
