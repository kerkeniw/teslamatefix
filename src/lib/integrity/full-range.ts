import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pickNearestByDate } from "@/lib/integrity/nearest-by-date";

/**
 * Autonomie à 100 % mesurée au plus près d'une date, et autonomies déduites
 * d'un % batterie. Partagé par l'assistant de création de trajet et l'édition
 * de charge (SOC → autonomies).
 */

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fullRange(level: number | null | undefined, range: number | null): number | null {
  if (level == null || level <= 0 || range == null) return null;
  return range / (level / 100);
}

/**
 * Récupère, pour une mesure (`positions` ou `charges`), l'échantillon dont la
 * date est la plus proche de `refDate` : plus proche mesure ≤ refDate et plus
 * proche mesure > refDate, puis on garde le plus proche dans le temps.
 */
async function nearestSample<T extends { date: Date }>(
  refDate: Date,
  find: (dateWhere: Prisma.DateTimeFilter, order: Prisma.SortOrder) => Promise<T | null>,
): Promise<T | null> {
  const [before, after] = await Promise.all([
    find({ lte: refDate }, "desc"),
    find({ gt: refDate }, "asc"),
  ]);
  return pickNearestByDate(before, after, refDate.getTime());
}

/**
 * Estime l'autonomie idéale/rated à 100 % pour un véhicule à partir de son
 * historique, **relatif à `refDate`** (la date de départ du trajet) : on prend
 * la mesure (position, sinon charge) la plus proche dans le temps ayant à la
 * fois un % batterie > 0 et l'autonomie correspondante, d'où
 * `max = autonomie / (%/100)`. Cela reflète la capacité/dégradation de la
 * batterie à cette période plutôt que la plus récente. Les deux autonomies sont
 * cherchées séparément (un point peut n'avoir que l'une). Renvoie `null` par
 * champ si rien d'exploitable.
 */
export async function estimateFullRange(
  carId: number,
  refDate: Date,
): Promise<{ maxIdealRangeKm: number | null; maxRatedRangeKm: number | null }> {
  const [posIdeal, posRated] = await Promise.all([
    nearestSample(refDate, (date, orderBy) =>
      prisma.positions.findFirst({
        where: { car_id: carId, battery_level: { gt: 0 }, ideal_battery_range_km: { not: null }, date },
        orderBy: { date: orderBy },
        select: { date: true, battery_level: true, ideal_battery_range_km: true },
      }),
    ),
    nearestSample(refDate, (date, orderBy) =>
      prisma.positions.findFirst({
        where: { car_id: carId, battery_level: { gt: 0 }, rated_battery_range_km: { not: null }, date },
        orderBy: { date: orderBy },
        select: { date: true, battery_level: true, rated_battery_range_km: true },
      }),
    ),
  ]);

  let maxIdealRangeKm = fullRange(posIdeal?.battery_level, num(posIdeal?.ideal_battery_range_km));
  let maxRatedRangeKm = fullRange(posRated?.battery_level, num(posRated?.rated_battery_range_km));

  // Repli sur les charges (pas de car_id → via la relation charging_processes).
  if (maxIdealRangeKm == null) {
    const chg = await nearestSample(refDate, (date, orderBy) =>
      prisma.charges.findFirst({
        // charges.ideal_battery_range_km est NOT NULL : pas de filtre `not null`.
        where: { charging_processes: { car_id: carId }, battery_level: { gt: 0 }, date },
        orderBy: { date: orderBy },
        select: { date: true, battery_level: true, ideal_battery_range_km: true },
      }),
    );
    maxIdealRangeKm = fullRange(chg?.battery_level, num(chg?.ideal_battery_range_km));
  }
  if (maxRatedRangeKm == null) {
    const chg = await nearestSample(refDate, (date, orderBy) =>
      prisma.charges.findFirst({
        where: { charging_processes: { car_id: carId }, battery_level: { gt: 0 }, rated_battery_range_km: { not: null }, date },
        orderBy: { date: orderBy },
        select: { date: true, battery_level: true, rated_battery_range_km: true },
      }),
    );
    maxRatedRangeKm = fullRange(chg?.battery_level, num(chg?.rated_battery_range_km));
  }

  return { maxIdealRangeKm, maxRatedRangeKm };
}

/**
 * Autonomies idéale/rated (km) correspondant à un % batterie, d'après
 * l'autonomie à 100 % mesurée au plus près de `refDate`. `null` par champ si
 * l'historique ne permet pas l'estimation.
 */
export async function estimateRangesAtLevel(
  carId: number,
  refDate: Date,
  batteryLevel: number,
): Promise<{ idealRangeKm: number | null; ratedRangeKm: number | null }> {
  const { maxIdealRangeKm, maxRatedRangeKm } = await estimateFullRange(carId, refDate);
  const factor = batteryLevel / 100;
  return {
    idealRangeKm: maxIdealRangeKm == null ? null : round2(maxIdealRangeKm * factor),
    ratedRangeKm: maxRatedRangeKm == null ? null : round2(maxRatedRangeKm * factor),
  };
}
