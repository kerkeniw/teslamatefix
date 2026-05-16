import { prisma } from "@/lib/db";

export const POSITION_SNAPSHOT_SELECT = {
  id: true,
  date: true,
  latitude: true,
  longitude: true,
  odometer: true,
  outside_temp: true,
  inside_temp: true,
  battery_level: true,
  usable_battery_level: true,
  ideal_battery_range_km: true,
  rated_battery_range_km: true,
  est_battery_range_km: true,
  elevation: true,
  power: true,
  speed: true,
  car_id: true,
  drive_id: true,
} as const;

export type PositionSnapshot = {
  id: number;
  date: Date;
  latitude: import("@prisma/client").Prisma.Decimal;
  longitude: import("@prisma/client").Prisma.Decimal;
  odometer: number | null;
  outside_temp: import("@prisma/client").Prisma.Decimal | null;
  inside_temp: import("@prisma/client").Prisma.Decimal | null;
  battery_level: number | null;
  usable_battery_level: number | null;
  ideal_battery_range_km: import("@prisma/client").Prisma.Decimal | null;
  rated_battery_range_km: import("@prisma/client").Prisma.Decimal | null;
  est_battery_range_km: import("@prisma/client").Prisma.Decimal | null;
  elevation: number | null;
  power: number | null;
  speed: number | null;
  car_id: number;
  drive_id: number | null;
};

/**
 * Dernière `positions` du véhicule strictement avant la date donnée.
 * Pas de fenêtre temporelle : on prend le TOP 1 par date desc.
 */
export async function findPositionBefore(
  carId: number,
  date: Date,
): Promise<PositionSnapshot | null> {
  return prisma.positions.findFirst({
    where: { car_id: carId, date: { lt: date } },
    orderBy: { date: "desc" },
    select: POSITION_SNAPSHOT_SELECT,
  });
}

/**
 * Première `positions` du véhicule strictement après la date donnée.
 * Pas de fenêtre temporelle : on prend le TOP 1 par date asc.
 */
export async function findPositionAfter(
  carId: number,
  date: Date,
): Promise<PositionSnapshot | null> {
  return prisma.positions.findFirst({
    where: { car_id: carId, date: { gt: date } },
    orderBy: { date: "asc" },
    select: POSITION_SNAPSHOT_SELECT,
  });
}

export type FallbackDirection = "before" | "after";

const FALLBACKABLE_FIELDS = [
  "battery_level",
  "usable_battery_level",
  "outside_temp",
  "inside_temp",
  "ideal_battery_range_km",
  "rated_battery_range_km",
  "est_battery_range_km",
] as const;
type FallbackableField = (typeof FALLBACKABLE_FIELDS)[number];

/**
 * Enrichit un PositionSnapshot en remplaçant ses champs batterie/temp/range
 * NULL par la valeur de la position voisine la plus proche en date
 * (même direction temporelle que la résolution initiale).
 *
 * Raison : Tesla coupe parfois le réseau, ce qui produit des positions GPS
 * sans relevé batterie/climat. La TOP 1 position avant/après start/end peut
 * donc avoir des trous. On rebouche en allant chercher la valeur la plus
 * proche disponible — sans fenêtre temporelle (décision user).
 *
 * Une requête Prisma par champ NULL (max 7). Indexé sur (car_id, date).
 */
export async function enrichPositionFields(
  carId: number,
  snapshot: PositionSnapshot,
  direction: FallbackDirection,
): Promise<PositionSnapshot> {
  const enriched: PositionSnapshot = { ...snapshot };
  const dateFilter =
    direction === "before" ? { lt: snapshot.date } : { gt: snapshot.date };
  const orderBy = direction === "before" ? "desc" : "asc";

  await Promise.all(
    FALLBACKABLE_FIELDS.map(async (field) => {
      if (enriched[field] != null) return;
      const row = await prisma.positions.findFirst({
        where: {
          car_id: carId,
          date: dateFilter,
          [field]: { not: null },
        },
        orderBy: { date: orderBy },
        select: { [field]: true },
      });
      if (row && (row as Record<string, unknown>)[field] != null) {
        (enriched as unknown as Record<string, unknown>)[field] = (
          row as Record<string, unknown>
        )[field];
      }
    }),
  );

  return enriched;
}

export type { FallbackableField };
