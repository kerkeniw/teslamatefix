import { prisma } from "@/lib/db";
import { getPositionOrigins } from "@/lib/positions/origin-query";
import { countOrigins, type OriginCounts, type OriginMode, type PositionOrigin } from "@/lib/positions/origin";
import { POSITION_SCALAR_COLUMNS, type PositionScalarKey } from "@/lib/positions/columns";

/** Plafond des positions d'un trajet chargées pour l'écran de détail (≈ 5 h 30 de flux à 1 Hz). */
export const DRIVE_POSITIONS_CAP = 20_000;

/**
 * Ligne transportée vers le client. Les colonnes scalaires nulles sont omises
 * (`v`) pour alléger le payload RSC d'un trajet de plusieurs milliers de points.
 */
export type DrivePositionRow = {
  id: number;
  date: string; // ISO UTC
  lat: number;
  lng: number;
  origin: PositionOrigin;
  d13Kind: string | null;
  v: Partial<Record<PositionScalarKey, number | boolean>>;
};

export type DrivePositionsDetail = {
  rows: DrivePositionRow[];
  total: number;
  truncated: boolean;
  /** Nombre de valeurs non nulles par colonne, sur les lignes chargées. */
  filled: Record<PositionScalarKey, number>;
  originMode: OriginMode;
  originCounts: OriginCounts;
};

const SELECT = {
  id: true,
  date: true,
  latitude: true,
  longitude: true,
  ...Object.fromEntries(POSITION_SCALAR_COLUMNS.map((c) => [c.key, true])),
} as const;

function scalar(v: unknown): number | boolean | null {
  if (v == null) return null;
  if (typeof v === "boolean" || typeof v === "number") return v;
  const n = Number(v); // Prisma.Decimal
  return Number.isFinite(n) ? n : null;
}

export async function loadDrivePositions(driveId: number): Promise<DrivePositionsDetail> {
  const [total, raw] = await Promise.all([
    prisma.positions.count({ where: { drive_id: driveId } }),
    prisma.positions.findMany({
      where: { drive_id: driveId },
      orderBy: { date: "asc" },
      take: DRIVE_POSITIONS_CAP,
      select: SELECT,
    }),
  ]);
  const positions = raw as unknown as (Record<string, unknown> & {
    id: number;
    date: Date;
    latitude: unknown;
    longitude: unknown;
    ideal_battery_range_km: unknown;
    rated_battery_range_km: unknown;
  })[];

  const { mode, byId } = await getPositionOrigins(positions);

  const filled = Object.fromEntries(POSITION_SCALAR_COLUMNS.map((c) => [c.key, 0])) as Record<
    PositionScalarKey,
    number
  >;
  const rows: DrivePositionRow[] = positions.map((p) => {
    const v: DrivePositionRow["v"] = {};
    for (const c of POSITION_SCALAR_COLUMNS) {
      const x = scalar(p[c.key]);
      if (x != null) {
        v[c.key] = x;
        filled[c.key] += 1;
      }
    }
    const info = byId.get(p.id);
    return {
      id: p.id,
      date: p.date.toISOString(),
      lat: Number(p.latitude),
      lng: Number(p.longitude),
      origin: info?.origin ?? "flux",
      d13Kind: info?.d13Kind ?? null,
      v,
    };
  });

  return {
    rows,
    total,
    truncated: total > rows.length,
    filled,
    originMode: mode,
    originCounts: countOrigins(rows.map((r) => r.origin)),
  };
}
