import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type DriveRecalc = {
  start_date: Date | null;
  end_date: Date | null;
  distance: number | null; // km
  duration_min: number | null;
  ascent: number | null;
  descent: number | null;
  speed_max: number | null;
};

export const EARTH_RADIUS_KM = 6371;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Haversine : distance grand-cercle entre deux points GPS, en km. On somme
// les segments successifs ; ça surestime légèrement par rapport à un calcul
// géodésique précis mais correspond à ce que TeslaMate fait côté Elixir.
// Exporté pour tests unitaires (vitest).
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Type d'une position pour les calculs de drive (sous-ensemble strict de
 * `prisma.positions`). Latitude/longitude sont des `Decimal` ou nombres ;
 * on accepte tout ce qui peut être passé à `Number()`.
 */
export type DriveRecalcPosition = {
  date: Date;
  latitude: number | string | { toString(): string };
  longitude: number | string | { toString(): string };
  elevation?: number | null;
  speed?: number | null;
};

/**
 * Logique pure de recalcul à partir d'une liste ordonnée de positions.
 * Extrait de `recalcFromPositions` pour être testable sans Prisma.
 *
 * Hypothèse : `positions` est trié chronologiquement (ASC sur `date`).
 * Renvoie `null` si la liste est vide.
 */
export function computeRecalcFromPositions(
  positions: DriveRecalcPosition[],
): DriveRecalc | null {
  if (positions.length === 0) return null;

  let distance = 0;
  let ascent = 0;
  let descent = 0;
  let speedMax = 0;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (p.speed != null && p.speed > speedMax) speedMax = p.speed;
    if (i === 0) continue;
    const prev = positions[i - 1];
    distance += haversineKm(
      Number(prev.latitude),
      Number(prev.longitude),
      Number(p.latitude),
      Number(p.longitude),
    );
    if (prev.elevation != null && p.elevation != null) {
      const d = p.elevation - prev.elevation;
      if (d > 0) ascent += d;
      else if (d < 0) descent += -d;
    }
  }

  const startDate = positions[0].date;
  const endDate = positions[positions.length - 1].date;
  const durationMin = Math.round(
    (endDate.getTime() - startDate.getTime()) / 60000,
  );

  return {
    start_date: startDate,
    end_date: endDate,
    distance: Number(distance.toFixed(3)),
    duration_min: durationMin,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    speed_max: speedMax,
  };
}

export async function recalcFromPositions(
  driveId: number,
): Promise<{ before: DriveRecalc; after: DriveRecalc }> {
  const drive = await prisma.drives.findUnique({
    where: { id: driveId },
    select: {
      start_date: true,
      end_date: true,
      distance: true,
      duration_min: true,
      ascent: true,
      descent: true,
      speed_max: true,
    },
  });
  if (!drive) {
    throw new Error(`drive ${driveId} not found`);
  }

  const before: DriveRecalc = {
    start_date: drive.start_date,
    end_date: drive.end_date,
    distance: drive.distance ?? null,
    duration_min: drive.duration_min ?? null,
    ascent: drive.ascent ?? null,
    descent: drive.descent ?? null,
    speed_max: drive.speed_max ?? null,
  };

  const positions = await prisma.positions.findMany({
    where: { drive_id: driveId },
    orderBy: { date: "asc" },
    select: {
      date: true,
      latitude: true,
      longitude: true,
      elevation: true,
      speed: true,
    },
  });

  const after = computeRecalcFromPositions(positions);
  if (!after) {
    return { before, after: { ...before } };
  }

  return { before, after };
}

export async function applyRecalc(
  driveId: number,
  recalc: Partial<DriveRecalc>,
): Promise<void> {
  const data: Prisma.drivesUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(recalc, "start_date")) {
    data.start_date = recalc.start_date ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "end_date")) {
    data.end_date = recalc.end_date;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "distance")) {
    data.distance = recalc.distance;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "duration_min")) {
    data.duration_min = recalc.duration_min;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "ascent")) {
    data.ascent = recalc.ascent;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "descent")) {
    data.descent = recalc.descent;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "speed_max")) {
    data.speed_max = recalc.speed_max;
  }
  await prisma.drives.update({ where: { id: driveId }, data });
}
