import { prisma } from "@/lib/db";
import { logger, safeErr } from "@/lib/logger";

/**
 * Détection facultative de TeslaMateAPI (schéma `telemetry`), cf.
 * docs/INTEGRATION_TESLAMATEAPI.md :
 *   - jamais d'erreur ni d'avertissement à l'écran si absent ;
 *   - une capacité par table, droits SELECT compris ;
 *   - résultat mémorisé quelques minutes (TeslaMateAPI peut être installé ou
 *     mis à jour après le démarrage) ;
 *   - lecture seule, hors client Prisma (`$queryRaw`).
 */
export type TeslaMateApiCapabilities = {
  installed: boolean;
  archive: boolean;
  reconstructions: boolean;
  fill: boolean;
};

export const NO_CAPABILITIES: TeslaMateApiCapabilities = {
  installed: false,
  archive: false,
  reconstructions: false,
  fill: false,
};

const TTL_MS = 5 * 60 * 1000;

let cached: { at: number; value: TeslaMateApiCapabilities } | null = null;
let lastLogged: string | null = null;
let warnedFailure = false;

export async function getTeslaMateApiCapabilities(
  options: { force?: boolean } = {},
): Promise<TeslaMateApiCapabilities> {
  if (!options.force && cached && Date.now() - cached.at < TTL_MS) return cached.value;

  let value: TeslaMateApiCapabilities;
  try {
    const rows = await prisma.$queryRaw<TeslaMateApiCapabilities[]>`
      SELECT
        coalesce(obj_description(to_regnamespace('telemetry'), 'pg_namespace') LIKE 'TeslaMateAPI%', false) AS installed,
        coalesce(has_table_privilege(to_regclass('telemetry.records'),          'SELECT'), false) AS archive,
        coalesce(has_table_privilege(to_regclass('telemetry.reconstructions'),  'SELECT'), false) AS reconstructions,
        coalesce(has_table_privilege(to_regclass('telemetry.filled_positions'), 'SELECT'), false) AS fill
    `;
    const r = rows[0] ?? NO_CAPABILITIES;
    // Un schéma `telemetry` d'un autre outil ne donne aucune capacité.
    value = r.installed
      ? { installed: true, archive: r.archive, reconstructions: r.reconstructions, fill: r.fill }
      : NO_CAPABILITIES;
  } catch (e) {
    if (!warnedFailure) {
      warnedFailure = true;
      logger.warn(
        { event: "teslamateapi.detect.error", err: safeErr(e) },
        "TeslaMateAPI detection failed",
      );
    }
    value = NO_CAPABILITIES;
  }

  cached = { at: Date.now(), value };
  const signature = JSON.stringify(value);
  if (signature !== lastLogged) {
    lastLogged = signature;
    logger.info({ event: "teslamateapi.detected", ...value }, "TeslaMateAPI capabilities");
  }
  return value;
}

/** Invalide le cache (ex. requête `telemetry` en échec : colonne disparue). */
export function invalidateTeslaMateApiCapabilities(): void {
  cached = null;
}
