/**
 * Origine d'une position TeslaMate (docs/ORIGINE_POSITIONS.md). Module pur,
 * importable côté client ; la requête SQL est dans `origin-query.ts`.
 *
 * - `vehicle_data`  : appel Fleet API — autonomies, températures… remplies ;
 * - `flux`          : trame Fleet Telemetry — seules les colonnes du protocole ;
 * - `flux_complete` : trame complétée par D13 FILL (TeslaMateAPI) ;
 * - `d13`           : position créée par une reconstruction D13 (TeslaMateAPI).
 *
 * Sans les traces de TeslaMateAPI, seules `vehicle_data` et `flux` sont
 * distinguables (mode `columns`) : une `flux_complete` passe pour
 * `vehicle_data` et une `d13` est inclassable.
 */
export const POSITION_ORIGINS = ["vehicle_data", "flux", "flux_complete", "d13"] as const;
export type PositionOrigin = (typeof POSITION_ORIGINS)[number];

/** `full` = traces TeslaMateAPI lues ; `columns` = signature des colonnes seule. */
export type OriginMode = "full" | "columns";

/** Couleurs stables (carte, pastilles, légende). */
export const ORIGIN_COLORS: Record<PositionOrigin, string> = {
  vehicle_data: "#2563eb", // bleu
  flux: "#16a34a", // vert
  flux_complete: "#d97706", // ambre
  d13: "#c026d3", // magenta
};

export function isPositionOrigin(v: unknown): v is PositionOrigin {
  return typeof v === "string" && (POSITION_ORIGINS as readonly string[]).includes(v);
}

/** Classement par la seule signature des colonnes (autonomies remplies ou non). */
export function originFromColumns(p: {
  ideal_battery_range_km: unknown;
  rated_battery_range_km: unknown;
}): PositionOrigin {
  return p.ideal_battery_range_km != null || p.rated_battery_range_km != null
    ? "vehicle_data"
    : "flux";
}

/** Données reconstruites par TeslaMateAPI : à signaler avant une correction manuelle. */
export function isReconstructed(o: PositionOrigin): boolean {
  return o === "d13" || o === "flux_complete";
}

export type OriginCounts = Record<PositionOrigin, number>;

export function countOrigins(origins: Iterable<PositionOrigin>): OriginCounts {
  const counts: OriginCounts = { vehicle_data: 0, flux: 0, flux_complete: 0, d13: 0 };
  for (const o of origins) counts[o] += 1;
  return counts;
}
