import type { PositionOrigin } from "./origin";
import type { PositionScalarKey } from "./columns";

/**
 * Filtres du tableau des positions d'un trajet (côté client, toutes les
 * positions du trajet étant chargées). Module pur, testé unitairement.
 */
export type DrivePositionFilters = {
  /** Origines retenues ; vide = toutes. */
  origins: PositionOrigin[];
  speedMin: number | null;
  speedMax: number | null;
  powerMin: number | null;
  powerMax: number | null;
  /** Ne garder que les positions où cette colonne est vide. */
  emptyColumn: PositionScalarKey | null;
  /** Écart avec la position précédente ≥ N secondes (trous de collecte). */
  gapMinS: number | null;
  /** Saut avec la position précédente ≥ N mètres (sauts GPS). */
  jumpMinM: number | null;
};

export const EMPTY_FILTERS: DrivePositionFilters = {
  origins: [],
  speedMin: null,
  speedMax: null,
  powerMin: null,
  powerMax: null,
  emptyColumn: null,
  gapMinS: null,
  jumpMinM: null,
};

export type FilterablePosition = {
  date: string;
  lat: number;
  lng: number;
  origin: PositionOrigin;
  v: Partial<Record<PositionScalarKey, number | boolean>>;
};

// Haversine en mètres. Pas d'import de `lib/integrity/drives` (qui charge
// Prisma) : ce module est utilisé côté client.
function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Écart (s) et distance (m) avec la position précédente, `null` pour la première. */
export type PositionDeltas = { dtS: number | null; dM: number | null };

export function computeDeltas(rows: FilterablePosition[]): PositionDeltas[] {
  return rows.map((r, i) => {
    if (i === 0) return { dtS: null, dM: null };
    const prev = rows[i - 1];
    return {
      dtS: (new Date(r.date).getTime() - new Date(prev.date).getTime()) / 1000,
      dM: distanceM(prev.lat, prev.lng, r.lat, r.lng),
    };
  });
}

function numeric(v: number | boolean | undefined): number | null {
  return typeof v === "number" ? v : null;
}

function inRange(v: number | null, min: number | null, max: number | null): boolean {
  if (min == null && max == null) return true;
  if (v == null) return false;
  if (min != null && v < min) return false;
  if (max != null && v > max) return false;
  return true;
}

export function matchesFilters(
  row: FilterablePosition,
  delta: PositionDeltas,
  f: DrivePositionFilters,
): boolean {
  if (f.origins.length > 0 && !f.origins.includes(row.origin)) return false;
  if (!inRange(numeric(row.v.speed), f.speedMin, f.speedMax)) return false;
  if (!inRange(numeric(row.v.power), f.powerMin, f.powerMax)) return false;
  if (f.emptyColumn != null && row.v[f.emptyColumn] != null) return false;
  if (f.gapMinS != null && !(delta.dtS != null && delta.dtS >= f.gapMinS)) return false;
  if (f.jumpMinM != null && !(delta.dM != null && delta.dM >= f.jumpMinM)) return false;
  return true;
}

export function activeFilterCount(f: DrivePositionFilters): number {
  let n = 0;
  if (f.origins.length > 0) n++;
  if (f.speedMin != null || f.speedMax != null) n++;
  if (f.powerMin != null || f.powerMax != null) n++;
  if (f.emptyColumn != null) n++;
  if (f.gapMinS != null) n++;
  if (f.jumpMinM != null) n++;
  return n;
}
