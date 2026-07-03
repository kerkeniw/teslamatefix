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
 * Logique pure de recalcul (métriques) à partir d'une liste ordonnée de positions.
 * Réutilisée par `computeDriveCorrection` ; testable sans Prisma.
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

// ---------------------------------------------------------------------------
// Correction d'un trajet non fermé / en anomalie
// ---------------------------------------------------------------------------

// duration_min est un SmallInt Postgres (max 32767 min ≈ 22,7 j) : on borne
// pour un trajet resté ouvert très longtemps.
const DURATION_MIN_MAX = 32767;
// Approximation métrique : 1° de latitude ≈ 111 320 m.
const METERS_PER_DEG_LAT = 111320;

/** Reconstruction complète d'un trajet depuis ses positions (bornes + métriques + FK). */
export type DriveCorrection = {
  start_date: Date | null;
  end_date: Date | null;
  start_position_id: number | null;
  end_position_id: number | null;
  start_km: number | null;
  end_km: number | null;
  start_ideal_range_km: number | null;
  end_ideal_range_km: number | null;
  start_rated_range_km: number | null;
  end_rated_range_km: number | null;
  distance: number | null;
  duration_min: number | null;
  ascent: number | null;
  descent: number | null;
  speed_max: number | null;
  power_max: number | null;
  power_min: number | null;
  outside_temp_avg: number | null;
  inside_temp_avg: number | null;
  start_address_id: number | null;
  end_address_id: number | null;
  start_geofence_id: number | null;
  end_geofence_id: number | null;
};

/** Version transportable (dates ISO) échangée avec le client. */
export type DriveCorrectionSerialized = Omit<
  DriveCorrection,
  "start_date" | "end_date"
> & { start_date: string | null; end_date: string | null };

/** Libellés lisibles des FK adresse/géofence, pour l'aperçu avant/après. */
export type FkLabels = {
  start_address: string | null;
  end_address: string | null;
  start_geofence: string | null;
  end_geofence: string | null;
};

export type DriveCorrectionPosition = DriveRecalcPosition & {
  id: number;
  odometer?: number | null;
  power?: number | null;
  outside_temp?: number | string | { toString(): string } | null;
  inside_temp?: number | string | { toString(): string } | null;
  ideal_battery_range_km?: number | string | { toString(): string } | null;
  rated_battery_range_km?: number | string | { toString(): string } | null;
};

function num(v: number | string | { toString(): string } | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type RangeGetter = (
  p: DriveCorrectionPosition,
) => number | string | { toString(): string } | null | undefined;

// Première/dernière valeur non nulle d'un champ (ex. autonomie souvent null au bord).
function firstNonNull(positions: DriveCorrectionPosition[], get: RangeGetter): number | null {
  for (const p of positions) {
    const v = num(get(p));
    if (v != null) return v;
  }
  return null;
}
function lastNonNull(positions: DriveCorrectionPosition[], get: RangeGetter): number | null {
  for (let i = positions.length - 1; i >= 0; i--) {
    const v = num(get(positions[i]));
    if (v != null) return v;
  }
  return null;
}
function maxNonNull(positions: DriveCorrectionPosition[], get: RangeGetter): number | null {
  let out: number | null = null;
  for (const p of positions) {
    const v = num(get(p));
    if (v != null && (out == null || v > out)) out = v;
  }
  return out;
}
function minNonNull(positions: DriveCorrectionPosition[], get: RangeGetter): number | null {
  let out: number | null = null;
  for (const p of positions) {
    const v = num(get(p));
    if (v != null && (out == null || v < out)) out = v;
  }
  return out;
}
function avgNonNull(positions: DriveCorrectionPosition[], get: RangeGetter): number | null {
  let sum = 0;
  let n = 0;
  for (const p of positions) {
    const v = num(get(p));
    if (v != null) {
      sum += v;
      n++;
    }
  }
  return n === 0 ? null : Math.round((sum / n) * 10) / 10;
}

/** Position candidate à l'absorption (trajet non fermé) : positions orphelines de fin. */
export type AbsorbCandidate = DriveCorrectionPosition & { drive_id?: number | null };

/**
 * Sélectionne, dans une liste ordonnée ASC de positions qui suivent un trajet,
 * celles à rattacher : orphelines (`drive_id` null) contiguës, jusqu'à (et
 * incluant) la première à l'arrêt (`speed === 0`). S'arrête dès qu'une position
 * appartient déjà à un trajet. Fonction pure (testable sans DB).
 */
export function selectTrailingToAbsorb(trailing: AbsorbCandidate[]): AbsorbCandidate[] {
  const out: AbsorbCandidate[] = [];
  for (const p of trailing) {
    if (p.drive_id != null) break;
    out.push(p);
    if (p.speed === 0) break;
  }
  return out;
}

/**
 * Logique pure : reconstruit les bornes + métriques depuis les positions
 * triées ASC. Les FK adresse/géofence restent `null` (résolues côté DB par le
 * wrapper). Renvoie `null` si aucune position.
 */
export function computeDriveCorrection(
  positions: DriveCorrectionPosition[],
): DriveCorrection | null {
  const metrics = computeRecalcFromPositions(positions);
  if (!metrics) return null;
  const first = positions[0];
  const last = positions[positions.length - 1];
  return {
    ...metrics,
    duration_min:
      metrics.duration_min == null
        ? null
        : Math.min(metrics.duration_min, DURATION_MIN_MAX),
    start_position_id: first.id,
    end_position_id: last.id,
    start_km: num(first.odometer),
    end_km: num(last.odometer),
    // Autonomies : 1re/dernière valeur non nulle (souvent null en bord de trajet).
    start_ideal_range_km: firstNonNull(positions, (p) => p.ideal_battery_range_km),
    end_ideal_range_km: lastNonNull(positions, (p) => p.ideal_battery_range_km),
    start_rated_range_km: firstNonNull(positions, (p) => p.rated_battery_range_km),
    end_rated_range_km: lastNonNull(positions, (p) => p.rated_battery_range_km),
    // Puissance : extrêmes signés (min = régénération). Températures : moyennes non nulles.
    power_max: maxNonNull(positions, (p) => p.power),
    power_min: minNonNull(positions, (p) => p.power),
    outside_temp_avg: avgNonNull(positions, (p) => p.outside_temp),
    inside_temp_avg: avgNonNull(positions, (p) => p.inside_temp),
    start_address_id: null,
    end_address_id: null,
    start_geofence_id: null,
    end_geofence_id: null,
  };
}

function addressLabel(a: {
  id: number;
  name: string | null;
  road: string | null;
  city: string | null;
  display_name: string | null;
}): string {
  return (
    a.name ??
    ([a.road, a.city].filter(Boolean).join(", ") || a.display_name || `#${a.id}`)
  );
}

/** Adresse existante la plus proche dans un rayon de `meters` (défaut 50 m), sinon null. */
export async function findNearestAddressWithin(
  lat: number,
  lon: number,
  meters = 50,
): Promise<{ id: number; label: string } | null> {
  const dLat = meters / METERS_PER_DEG_LAT;
  const cos = Math.cos(toRad(lat));
  const dLon = cos > 1e-6 ? dLat / cos : dLat;
  const candidates = await prisma.addresses.findMany({
    where: {
      latitude: { gte: lat - dLat, lte: lat + dLat },
      longitude: { gte: lon - dLon, lte: lon + dLon },
    },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      name: true,
      road: true,
      city: true,
      display_name: true,
    },
    take: 200,
  });
  let best: (typeof candidates)[number] | null = null;
  let bestKm = Infinity;
  for (const a of candidates) {
    if (a.latitude == null || a.longitude == null) continue;
    const dKm = haversineKm(lat, lon, Number(a.latitude), Number(a.longitude));
    if (dKm < bestKm) {
      bestKm = dKm;
      best = a;
    }
  }
  if (!best || bestKm * 1000 > meters) return null;
  return { id: best.id, label: addressLabel(best) };
}

/** Géofence contenant le point (distance ≤ son propre rayon), la plus proche si plusieurs. */
export async function findGeofenceContaining(
  lat: number,
  lon: number,
): Promise<{ id: number; label: string } | null> {
  const geofences = await prisma.geofences.findMany({
    select: { id: true, name: true, latitude: true, longitude: true, radius: true },
  });
  let best: { id: number; name: string } | null = null;
  let bestKm = Infinity;
  for (const g of geofences) {
    const dKm = haversineKm(lat, lon, Number(g.latitude), Number(g.longitude));
    if (dKm * 1000 <= g.radius && dKm < bestKm) {
      bestKm = dKm;
      best = { id: g.id, name: g.name };
    }
  }
  return best ? { id: best.id, label: best.name } : null;
}

export type DriveCorrectionCompute = {
  before: DriveCorrection;
  after: DriveCorrection;
  beforeLabels: FkLabels;
  afterLabels: FkLabels;
  positionCount: number;
  /** Positions orphelines de fin à rattacher (trajet non fermé). */
  absorbedPositionIds: number[];
  absorbedCount: number;
};

// Garde-fou sur le scan des positions candidates à l'absorption.
const ABSORB_SCAN_CAP = 2000;

/**
 * Calcule la correction d'un trajet : bornes/métriques depuis ses positions +
 * résolution des FK adresse (≤ 50 m) / géofence (rayon). L'adresse est conservée
 * si aucune n'est trouvée ; la géofence est mise à null si aucune ne contient le point.
 */
export async function correctDriveFromPositions(
  driveId: number,
): Promise<DriveCorrectionCompute> {
  const drive = await prisma.drives.findUnique({
    where: { id: driveId },
    select: {
      car_id: true,
      start_date: true,
      end_date: true,
      start_position_id: true,
      end_position_id: true,
      start_km: true,
      end_km: true,
      start_ideal_range_km: true,
      end_ideal_range_km: true,
      start_rated_range_km: true,
      end_rated_range_km: true,
      distance: true,
      duration_min: true,
      ascent: true,
      descent: true,
      speed_max: true,
      power_max: true,
      power_min: true,
      outside_temp_avg: true,
      inside_temp_avg: true,
      start_address_id: true,
      end_address_id: true,
      start_geofence_id: true,
      end_geofence_id: true,
      addresses_drives_start_address_idToaddresses: { select: { name: true, road: true, city: true, display_name: true } },
      addresses_drives_end_address_idToaddresses: { select: { name: true, road: true, city: true, display_name: true } },
      geofences_drives_start_geofence_idTogeofences: { select: { name: true } },
      geofences_drives_end_geofence_idTogeofences: { select: { name: true } },
    },
  });
  if (!drive) throw new Error(`drive ${driveId} not found`);

  const labelFromAddr = (
    a: { name: string | null; road: string | null; city: string | null; display_name: string | null } | null,
  ): string | null =>
    a
      ? (a.name ?? ([a.road, a.city].filter(Boolean).join(", ") || a.display_name || null))
      : null;

  const before: DriveCorrection = {
    start_date: drive.start_date,
    end_date: drive.end_date,
    start_position_id: drive.start_position_id ?? null,
    end_position_id: drive.end_position_id ?? null,
    start_km: drive.start_km ?? null,
    end_km: drive.end_km ?? null,
    start_ideal_range_km: num(drive.start_ideal_range_km),
    end_ideal_range_km: num(drive.end_ideal_range_km),
    start_rated_range_km: num(drive.start_rated_range_km),
    end_rated_range_km: num(drive.end_rated_range_km),
    distance: drive.distance ?? null,
    duration_min: drive.duration_min ?? null,
    ascent: drive.ascent ?? null,
    descent: drive.descent ?? null,
    speed_max: drive.speed_max ?? null,
    power_max: drive.power_max ?? null,
    power_min: drive.power_min ?? null,
    outside_temp_avg: num(drive.outside_temp_avg),
    inside_temp_avg: num(drive.inside_temp_avg),
    start_address_id: drive.start_address_id ?? null,
    end_address_id: drive.end_address_id ?? null,
    start_geofence_id: drive.start_geofence_id ?? null,
    end_geofence_id: drive.end_geofence_id ?? null,
  };
  const beforeLabels: FkLabels = {
    start_address: labelFromAddr(drive.addresses_drives_start_address_idToaddresses),
    end_address: labelFromAddr(drive.addresses_drives_end_address_idToaddresses),
    start_geofence: drive.geofences_drives_start_geofence_idTogeofences?.name ?? null,
    end_geofence: drive.geofences_drives_end_geofence_idTogeofences?.name ?? null,
  };

  const POSITION_SELECT = {
    id: true,
    date: true,
    latitude: true,
    longitude: true,
    elevation: true,
    speed: true,
    power: true,
    odometer: true,
    outside_temp: true,
    inside_temp: true,
    ideal_battery_range_km: true,
    rated_battery_range_km: true,
  } as const;

  const tagged = await prisma.positions.findMany({
    where: { drive_id: driveId },
    orderBy: { date: "asc" },
    select: POSITION_SELECT,
  });

  // Absorbe les positions orphelines de fin (jusqu'au 1er arrêt / prochain trajet),
  // pour Corriger comme pour Recalcul, trajet fermé ou non. `selectTrailingToAbsorb`
  // s'arrête dès qu'une position appartient déjà à un trajet → un trajet fermé sain
  // n'absorbe rien.
  let absorbed: AbsorbCandidate[] = [];
  {
    const anchor =
      tagged.length > 0
        ? { gt: tagged[tagged.length - 1].date }
        : { gte: drive.start_date };
    const candidates = await prisma.positions.findMany({
      where: { car_id: drive.car_id, date: anchor },
      orderBy: { date: "asc" },
      take: ABSORB_SCAN_CAP,
      select: { ...POSITION_SELECT, drive_id: true },
    });
    absorbed = selectTrailingToAbsorb(candidates);
  }

  const effective: DriveCorrectionPosition[] = [...tagged, ...absorbed];

  const core = computeDriveCorrection(effective);
  if (!core) {
    // Aucune position exploitable : correction impossible → no-op (after == before).
    return {
      before,
      after: { ...before },
      beforeLabels,
      afterLabels: { ...beforeLabels },
      positionCount: 0,
      absorbedPositionIds: [],
      absorbedCount: 0,
    };
  }

  const first = effective[0];
  const last = effective[effective.length - 1];
  const [startAddr, endAddr, startGeo, endGeo] = await Promise.all([
    findNearestAddressWithin(Number(first.latitude), Number(first.longitude)),
    findNearestAddressWithin(Number(last.latitude), Number(last.longitude)),
    findGeofenceContaining(Number(first.latitude), Number(first.longitude)),
    findGeofenceContaining(Number(last.latitude), Number(last.longitude)),
  ]);

  const after: DriveCorrection = {
    ...core,
    // Adresse : conserver l'actuelle si aucune trouvée dans le rayon.
    start_address_id: startAddr?.id ?? before.start_address_id,
    end_address_id: endAddr?.id ?? before.end_address_id,
    // Géofence : appartenance déterministe → null si aucune.
    start_geofence_id: startGeo?.id ?? null,
    end_geofence_id: endGeo?.id ?? null,
  };
  const afterLabels: FkLabels = {
    start_address: startAddr?.label ?? beforeLabels.start_address,
    end_address: endAddr?.label ?? beforeLabels.end_address,
    start_geofence: startGeo?.label ?? null,
    end_geofence: endGeo?.label ?? null,
  };

  return {
    before,
    after,
    beforeLabels,
    afterLabels,
    positionCount: effective.length,
    absorbedPositionIds: absorbed.map((p) => p.id),
    absorbedCount: absorbed.length,
  };
}

export async function applyDriveCorrection(
  driveId: number,
  c: DriveCorrection,
  absorbedPositionIds: number[] = [],
): Promise<void> {
  const data: Prisma.drivesUncheckedUpdateInput = {
    end_date: c.end_date,
    start_position_id: c.start_position_id,
    end_position_id: c.end_position_id,
    start_km: c.start_km,
    end_km: c.end_km,
    start_ideal_range_km: c.start_ideal_range_km,
    end_ideal_range_km: c.end_ideal_range_km,
    start_rated_range_km: c.start_rated_range_km,
    end_rated_range_km: c.end_rated_range_km,
    distance: c.distance,
    duration_min: c.duration_min,
    ascent: c.ascent,
    descent: c.descent,
    speed_max: c.speed_max,
    power_max: c.power_max,
    power_min: c.power_min,
    outside_temp_avg: c.outside_temp_avg,
    inside_temp_avg: c.inside_temp_avg,
    start_address_id: c.start_address_id,
    end_address_id: c.end_address_id,
    start_geofence_id: c.start_geofence_id,
    end_geofence_id: c.end_geofence_id,
  };
  // Ne jamais écraser start_date par null.
  if (c.start_date != null) data.start_date = c.start_date;

  await prisma.$transaction(async (tx) => {
    // Rattache les positions orphelines de fin à ce trajet, puis met à jour le trajet.
    if (absorbedPositionIds.length > 0) {
      await tx.positions.updateMany({
        where: { id: { in: absorbedPositionIds } },
        data: { drive_id: driveId },
      });
    }
    await tx.drives.update({ where: { id: driveId }, data });
  });
}
