import { prisma } from "@/lib/db";

export type DerivedEndFields = {
  end_battery_level: number | null;
  end_ideal_range_km: number | null;
  end_rated_range_km: number | null;
};

const HISTORY_LIMIT = 10;
const MIN_DELTA_SOC = 5;
const MIN_ENERGY_KWH = 0.5;
const RATIO_HISTORY_LIMIT = 20;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function estimateBatteryCapacityKwh(
  carId: number,
): Promise<number | null> {
  const charges = await prisma.charging_processes.findMany({
    where: {
      car_id: carId,
      end_date: { not: null },
      start_battery_level: { not: null },
      end_battery_level: { not: null },
      charge_energy_added: { not: null },
    },
    orderBy: { start_date: "desc" },
    take: HISTORY_LIMIT * 4,
    select: {
      start_battery_level: true,
      end_battery_level: true,
      charge_energy_added: true,
    },
  });

  const capacities: number[] = [];
  for (const c of charges) {
    const deltaSoc = (c.end_battery_level ?? 0) - (c.start_battery_level ?? 0);
    const energy = c.charge_energy_added != null ? Number(c.charge_energy_added) : 0;
    if (deltaSoc < MIN_DELTA_SOC || energy < MIN_ENERGY_KWH) continue;
    capacities.push((energy * 100) / deltaSoc);
    if (capacities.length >= HISTORY_LIMIT) break;
  }

  return median(capacities);
}

export async function estimateIdealToRatedRatio(
  carId: number,
): Promise<number | null> {
  const charges = await prisma.charging_processes.findMany({
    where: {
      car_id: carId,
      start_ideal_range_km: { not: null },
      start_rated_range_km: { not: null },
    },
    orderBy: { start_date: "desc" },
    take: RATIO_HISTORY_LIMIT,
    select: {
      start_ideal_range_km: true,
      start_rated_range_km: true,
    },
  });

  const ratios: number[] = [];
  for (const c of charges) {
    const ideal = c.start_ideal_range_km != null ? Number(c.start_ideal_range_km) : 0;
    const rated = c.start_rated_range_km != null ? Number(c.start_rated_range_km) : 0;
    if (ideal <= 0 || rated <= 0) continue;
    ratios.push(rated / ideal);
  }

  if (ratios.length === 0) return null;
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

export type DeriveInput = {
  car_id: number;
  start_battery_level: number | null;
  start_ideal_range_km: number | null;
  start_rated_range_km: number | null;
  charge_energy_added: number | null;
};

export async function deriveEndFields(input: DeriveInput): Promise<DerivedEndFields> {
  const energy = input.charge_energy_added;
  if (energy == null || energy <= 0) {
    return {
      end_battery_level: null,
      end_ideal_range_km: null,
      end_rated_range_km: null,
    };
  }

  const car = await prisma.cars.findUnique({
    where: { id: input.car_id },
    select: { efficiency: true },
  });
  const efficiency = car?.efficiency ?? null;

  const [capacity, ratio] = await Promise.all([
    estimateBatteryCapacityKwh(input.car_id),
    estimateIdealToRatedRatio(input.car_id),
  ]);

  let endBatteryLevel: number | null = null;
  if (capacity != null && capacity > 0 && input.start_battery_level != null) {
    const deltaSoc = (energy * 100) / capacity;
    endBatteryLevel = Math.min(100, Math.round(input.start_battery_level + deltaSoc));
  }

  // `cars.efficiency` est stocké par TeslaMate en kWh/km (Float, ~0.14-0.20
  // selon le modèle). Le hint UI parle de Wh/km parce que c'est l'unité
  // d'affichage TeslaMate (×1000), mais la valeur brute en DB est en kWh/km.
  let deltaKmIdeal: number | null = null;
  if (efficiency != null && efficiency > 0) {
    deltaKmIdeal = energy / efficiency;
  }

  let endIdealRangeKm: number | null = null;
  if (deltaKmIdeal != null && input.start_ideal_range_km != null) {
    endIdealRangeKm = Math.round((input.start_ideal_range_km + deltaKmIdeal) * 100) / 100;
  }

  let endRatedRangeKm: number | null = null;
  if (deltaKmIdeal != null && ratio != null && input.start_rated_range_km != null) {
    const deltaKmRated = deltaKmIdeal * ratio;
    endRatedRangeKm = Math.round((input.start_rated_range_km + deltaKmRated) * 100) / 100;
  }

  return {
    end_battery_level: endBatteryLevel,
    end_ideal_range_km: endIdealRangeKm,
    end_rated_range_km: endRatedRangeKm,
  };
}
