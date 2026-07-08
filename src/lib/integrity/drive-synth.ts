/**
 * Synthèse d'un trajet (drive) + ses positions à partir d'un itinéraire OSRM et
 * d'un état de départ. Logique **pure** (aucun accès Prisma / réseau) afin d'être
 * testable, comme `computeRecalcFromPositions`.
 *
 * Modèle de consommation (validé produit) : l'autonomie décroît de
 *   consumedKm = distance × (consumptionWhKm / ratedWhKm)
 * et le niveau batterie décroît au prorata (le max d'autonomie est déduit de
 * l'état de départ : `maxRange = startRange / (startLevel / 100)`).
 */
import { haversineKm } from "@/lib/integrity/drives";
import type { LatLon } from "@/lib/geo/route";

export type DriveStartState = {
  odometerKm: number;
  batteryLevel: number | null;
  idealRangeKm: number | null;
  ratedRangeKm: number | null;
  outsideTemp: number | null;
  insideTemp: number | null;
};

export type PositionSynth = {
  car_id: number;
  date: Date;
  latitude: number;
  longitude: number;
  speed: number | null;
  odometer: number;
  battery_level: number | null;
  ideal_battery_range_km: number | null;
  rated_battery_range_km: number | null;
  outside_temp: number | null;
  inside_temp: number | null;
};

export type DriveSynthSummary = {
  end_date: Date;
  distance: number;
  duration_min: number;
  start_km: number;
  end_km: number;
  start_ideal_range_km: number | null;
  end_ideal_range_km: number | null;
  start_rated_range_km: number | null;
  end_rated_range_km: number | null;
  outside_temp_avg: number | null;
  inside_temp_avg: number | null;
  speed_max: number | null;
};

export type SynthesizeInput = {
  carId: number;
  coordinates: LatLon[];
  distanceKm: number;
  durationS: number;
  startDate: Date;
  startState: DriveStartState;
  consumptionWhKm: number;
  ratedWhKm: number;
  sampleSeconds?: number;
};

export type SynthesizeResult = {
  positions: PositionSynth[];
  drive: DriveSynthSummary;
};

/** Distances cumulées (km) le long de la polyline ; cum[0] = 0. */
function cumulativeDistances(coords: LatLon[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const d = haversineKm(
      coords[i - 1].lat,
      coords[i - 1].lon,
      coords[i].lat,
      coords[i].lon,
    );
    cum.push(cum[i - 1] + d);
  }
  return cum;
}

/** Interpole un point à la distance cumulée cible le long de la polyline. */
function pointAtDistance(coords: LatLon[], cum: number[], target: number): LatLon {
  const total = cum[cum.length - 1];
  if (total <= 0) return coords[0];
  if (target <= 0) return coords[0];
  if (target >= total) return coords[coords.length - 1];
  // Recherche du segment contenant `target`.
  let i = 1;
  while (i < cum.length && cum[i] < target) i++;
  const segStart = cum[i - 1];
  const segEnd = cum[i];
  const segLen = segEnd - segStart;
  const f = segLen > 0 ? (target - segStart) / segLen : 0;
  const a = coords[i - 1];
  const b = coords[i];
  return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
}

function round(n: number, decimals: number): number {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

export function synthesizeDrive(input: SynthesizeInput): SynthesizeResult {
  const {
    carId,
    coordinates,
    distanceKm,
    durationS,
    startDate,
    startState,
    consumptionWhKm,
    ratedWhKm,
    sampleSeconds = 30,
  } = input;

  const coords = coordinates.length >= 2 ? coordinates : [coordinates[0], coordinates[0]];
  const cum = cumulativeDistances(coords);
  const geomTotal = cum[cum.length - 1];

  // Instants échantillonnés : 0, sample, 2·sample, …, durationS (dernier inclus).
  const times: number[] = [];
  if (durationS <= 0) {
    times.push(0);
  } else {
    for (let t = 0; t < durationS; t += sampleSeconds) times.push(t);
    times.push(durationS);
  }

  // Facteur de conversion distance → autonomie consommée (km d'autonomie estimée).
  const factor = ratedWhKm > 0 ? consumptionWhKm / ratedWhKm : 1;

  // Max d'autonomie déduit de l'état de départ pour reconvertir autonomie → %.
  const startRangeForLevel = startState.ratedRangeKm ?? startState.idealRangeKm;
  const maxRange =
    startState.batteryLevel != null &&
    startState.batteryLevel > 0 &&
    startRangeForLevel != null
      ? startRangeForLevel / (startState.batteryLevel / 100)
      : null;

  const positions: PositionSynth[] = [];
  let speedMax = 0;

  for (let k = 0; k < times.length; k++) {
    const t = times[k];
    const f = durationS > 0 ? t / durationS : 0;
    const covered = f * distanceKm; // km parcourus depuis le départ
    const point = pointAtDistance(coords, cum, f * geomTotal);

    const consumed = covered * factor;
    const ideal =
      startState.idealRangeKm != null
        ? Math.max(0, startState.idealRangeKm - consumed)
        : null;
    const rated =
      startState.ratedRangeKm != null
        ? Math.max(0, startState.ratedRangeKm - consumed)
        : null;
    const rangeForLevel = rated ?? ideal;
    const level =
      maxRange != null && rangeForLevel != null
        ? Math.max(0, Math.min(100, Math.round((rangeForLevel / maxRange) * 100)))
        : startState.batteryLevel;

    // Vitesse instantanée = Δdistance / Δtemps vers l'échantillon suivant.
    let speed: number | null = null;
    if (durationS > 0 && k < times.length - 1) {
      const dt = times[k + 1] - t;
      const dDist = (times[k + 1] - t) / durationS * distanceKm;
      speed = dt > 0 ? Math.round((dDist / dt) * 3600) : 0;
    } else if (positions.length > 0) {
      speed = positions[positions.length - 1].speed; // dernier point : reprend la vitesse précédente
    } else {
      speed = 0;
    }
    if (speed != null && speed > speedMax) speedMax = speed;

    positions.push({
      car_id: carId,
      date: new Date(startDate.getTime() + t * 1000),
      latitude: round(point.lat, 6),
      longitude: round(point.lon, 6),
      speed,
      odometer: round(startState.odometerKm + covered, 3),
      battery_level: level,
      ideal_battery_range_km: ideal != null ? round(ideal, 2) : null,
      rated_battery_range_km: rated != null ? round(rated, 2) : null,
      outside_temp: startState.outsideTemp,
      inside_temp: startState.insideTemp,
    });
  }

  const last = positions[positions.length - 1];
  const drive: DriveSynthSummary = {
    end_date: last.date,
    distance: round(distanceKm, 3),
    duration_min: Math.round(durationS / 60),
    start_km: round(startState.odometerKm, 3),
    end_km: round(startState.odometerKm + distanceKm, 3),
    start_ideal_range_km:
      startState.idealRangeKm != null ? round(startState.idealRangeKm, 2) : null,
    end_ideal_range_km: last.ideal_battery_range_km,
    start_rated_range_km:
      startState.ratedRangeKm != null ? round(startState.ratedRangeKm, 2) : null,
    end_rated_range_km: last.rated_battery_range_km,
    outside_temp_avg: startState.outsideTemp,
    inside_temp_avg: startState.insideTemp,
    speed_max: positions.some((p) => p.speed != null) ? speedMax : null,
  };

  return { positions, drive };
}
