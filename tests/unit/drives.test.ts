import { describe, expect, it } from "vitest";
import {
  computeRecalcFromPositions,
  computeDriveCorrection,
  selectTrailingToAbsorb,
  haversineKm,
  type DriveRecalcPosition,
  type DriveCorrectionPosition,
  type AbsorbCandidate,
} from "@/lib/integrity/drives";

/**
 * Tests purs sur la logique de recalc des drives — n'utilise PAS Prisma.
 * On exerce la formule Haversine et l'agrégation d'une liste de positions.
 */
describe("integrity/drives — haversineKm", () => {
  it("retourne 0 pour deux points identiques", () => {
    expect(haversineKm(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
  });

  it("approche la distance Paris -> Lyon (~392 km)", () => {
    // Paris 48.8566, 2.3522 — Lyon 45.7640, 4.8357
    const km = haversineKm(48.8566, 2.3522, 45.764, 4.8357);
    expect(km).toBeGreaterThan(390);
    expect(km).toBeLessThan(395);
  });

  it("est symétrique", () => {
    const ab = haversineKm(48.8566, 2.3522, 45.764, 4.8357);
    const ba = haversineKm(45.764, 4.8357, 48.8566, 2.3522);
    expect(ab).toBeCloseTo(ba, 9);
  });
});

describe("integrity/drives — computeRecalcFromPositions", () => {
  it("retourne null pour une liste vide", () => {
    expect(computeRecalcFromPositions([])).toBeNull();
  });

  it("retourne distance=0, durée=0 pour une seule position", () => {
    const positions: DriveRecalcPosition[] = [
      {
        date: new Date("2024-01-01T10:00:00Z"),
        latitude: 48.8566,
        longitude: 2.3522,
        elevation: 50,
        speed: 0,
      },
    ];
    const out = computeRecalcFromPositions(positions);
    expect(out).not.toBeNull();
    expect(out!.distance).toBe(0);
    expect(out!.ascent).toBe(0);
    expect(out!.descent).toBe(0);
    expect(out!.duration_min).toBe(0);
    expect(out!.start_date).toEqual(new Date("2024-01-01T10:00:00Z"));
    expect(out!.end_date).toEqual(new Date("2024-01-01T10:00:00Z"));
    expect(out!.speed_max).toBe(0);
  });

  it("retourne distance=0 pour deux positions identiques", () => {
    const positions: DriveRecalcPosition[] = [
      {
        date: new Date("2024-01-01T10:00:00Z"),
        latitude: 48.8566,
        longitude: 2.3522,
        elevation: 50,
      },
      {
        date: new Date("2024-01-01T10:05:00Z"),
        latitude: 48.8566,
        longitude: 2.3522,
        elevation: 50,
      },
    ];
    const out = computeRecalcFromPositions(positions)!;
    expect(out.distance).toBe(0);
    expect(out.ascent).toBe(0);
    expect(out.descent).toBe(0);
    expect(out.duration_min).toBe(5);
  });

  it("calcule distance, ascent/descent et speed_max sur 3 positions", () => {
    const positions: DriveRecalcPosition[] = [
      {
        date: new Date("2024-01-01T10:00:00Z"),
        latitude: 48.0,
        longitude: 2.0,
        elevation: 100,
        speed: 30,
      },
      {
        date: new Date("2024-01-01T10:30:00Z"),
        latitude: 48.1,
        longitude: 2.1,
        elevation: 150,
        speed: 80,
      },
      {
        date: new Date("2024-01-01T11:00:00Z"),
        latitude: 48.0,
        longitude: 2.0,
        elevation: 120,
        speed: 50,
      },
    ];
    const out = computeRecalcFromPositions(positions)!;
    // Distance > 0 (les deux segments cumulent au moins ~25 km, AR identique)
    expect(out.distance).toBeGreaterThan(20);
    // Ascent: +50 (100->150). Descent: -30 (150->120).
    expect(out.ascent).toBe(50);
    expect(out.descent).toBe(30);
    expect(out.speed_max).toBe(80);
    expect(out.duration_min).toBe(60);
  });

  it("ignore élévation manquante (null) sans planter", () => {
    const positions: DriveRecalcPosition[] = [
      {
        date: new Date("2024-01-01T10:00:00Z"),
        latitude: 48.0,
        longitude: 2.0,
        elevation: null,
      },
      {
        date: new Date("2024-01-01T10:10:00Z"),
        latitude: 48.05,
        longitude: 2.05,
        elevation: null,
      },
    ];
    const out = computeRecalcFromPositions(positions)!;
    expect(out.ascent).toBe(0);
    expect(out.descent).toBe(0);
    expect(out.distance).toBeGreaterThan(0);
  });

  it("accepte des coords Decimal-like (objet avec toString)", () => {
    // Simule un Prisma.Decimal qui sort de findMany — Number(decimal) marche.
    const decimal = (v: number) => ({
      toString: () => String(v),
      valueOf: () => v,
    });
    const positions: DriveRecalcPosition[] = [
      {
        date: new Date("2024-01-01T10:00:00Z"),
        latitude: decimal(48.0),
        longitude: decimal(2.0),
      },
      {
        date: new Date("2024-01-01T10:10:00Z"),
        latitude: decimal(48.1),
        longitude: decimal(2.1),
      },
    ];
    const out = computeRecalcFromPositions(positions)!;
    expect(out.distance).toBeGreaterThan(0);
    expect(Number.isFinite(out.distance!)).toBe(true);
  });
});

describe("integrity/drives — computeDriveCorrection", () => {
  it("retourne null sans position", () => {
    expect(computeDriveCorrection([])).toBeNull();
  });

  it("reconstruit les bornes depuis 1re/dernière position (FK laissés null)", () => {
    const positions: DriveCorrectionPosition[] = [
      {
        id: 100,
        date: new Date("2024-01-01T10:00:00Z"),
        latitude: 48.0,
        longitude: 2.0,
        elevation: 100,
        speed: 30,
        odometer: 1000,
        ideal_battery_range_km: 300,
        rated_battery_range_km: 280,
      },
      {
        id: 142,
        date: new Date("2024-01-01T10:30:00Z"),
        latitude: 48.1,
        longitude: 2.1,
        elevation: 150,
        speed: 90,
        odometer: 1025,
        ideal_battery_range_km: 285,
        rated_battery_range_km: 266,
      },
    ];
    const out = computeDriveCorrection(positions)!;
    expect(out.start_position_id).toBe(100);
    expect(out.end_position_id).toBe(142);
    expect(out.start_km).toBe(1000);
    expect(out.end_km).toBe(1025);
    expect(out.start_ideal_range_km).toBe(300);
    expect(out.end_ideal_range_km).toBe(285);
    expect(out.start_rated_range_km).toBe(280);
    expect(out.end_rated_range_km).toBe(266);
    expect(out.start_date).toEqual(new Date("2024-01-01T10:00:00Z"));
    expect(out.end_date).toEqual(new Date("2024-01-01T10:30:00Z"));
    expect(out.speed_max).toBe(90);
    expect(out.duration_min).toBe(30);
    // FK non résolus par la fonction pure.
    expect(out.start_address_id).toBeNull();
    expect(out.end_geofence_id).toBeNull();
  });

  it("gère odomètre/autonomies manquants (null)", () => {
    const positions: DriveCorrectionPosition[] = [
      { id: 1, date: new Date("2024-01-01T10:00:00Z"), latitude: 48.0, longitude: 2.0 },
      { id: 2, date: new Date("2024-01-01T10:05:00Z"), latitude: 48.01, longitude: 2.0 },
    ];
    const out = computeDriveCorrection(positions)!;
    expect(out.start_km).toBeNull();
    expect(out.end_km).toBeNull();
    expect(out.start_ideal_range_km).toBeNull();
  });

  it("borne duration_min au max SmallInt (32767)", () => {
    const positions: DriveCorrectionPosition[] = [
      { id: 1, date: new Date("2024-01-01T00:00:00Z"), latitude: 48.0, longitude: 2.0 },
      // ~40 jours plus tard → > 32767 min
      { id: 2, date: new Date("2024-02-10T00:00:00Z"), latitude: 48.0, longitude: 2.0 },
    ];
    const out = computeDriveCorrection(positions)!;
    expect(out.duration_min).toBe(32767);
  });

  it("résout les autonomies via 1re/dernière valeur non nulle", () => {
    const positions: DriveCorrectionPosition[] = [
      // bord de début : range null
      { id: 1, date: new Date("2024-01-01T10:00:00Z"), latitude: 48.0, longitude: 2.0, ideal_battery_range_km: null, rated_battery_range_km: null },
      { id: 2, date: new Date("2024-01-01T10:05:00Z"), latitude: 48.02, longitude: 2.0, ideal_battery_range_km: 300, rated_battery_range_km: 280 },
      { id: 3, date: new Date("2024-01-01T10:10:00Z"), latitude: 48.04, longitude: 2.0, ideal_battery_range_km: 290, rated_battery_range_km: 270 },
      // bord de fin : range null
      { id: 4, date: new Date("2024-01-01T10:15:00Z"), latitude: 48.06, longitude: 2.0, ideal_battery_range_km: null, rated_battery_range_km: null },
    ];
    const out = computeDriveCorrection(positions)!;
    // bornes = 1re/dernière position ; autonomies = 1re/dernière NON NULLE
    expect(out.start_position_id).toBe(1);
    expect(out.end_position_id).toBe(4);
    expect(out.start_ideal_range_km).toBe(300);
    expect(out.end_ideal_range_km).toBe(290);
    expect(out.start_rated_range_km).toBe(280);
    expect(out.end_rated_range_km).toBe(270);
  });

  it("calcule puissance (extrêmes signés) et températures moyennes (null ignorés)", () => {
    const positions: DriveCorrectionPosition[] = [
      { id: 1, date: new Date("2024-01-01T10:00:00Z"), latitude: 48.0, longitude: 2.0, power: 50, outside_temp: 10, inside_temp: null },
      { id: 2, date: new Date("2024-01-01T10:05:00Z"), latitude: 48.02, longitude: 2.0, power: -30, outside_temp: 12, inside_temp: 21 },
      { id: 3, date: new Date("2024-01-01T10:10:00Z"), latitude: 48.04, longitude: 2.0, power: null, outside_temp: null, inside_temp: 23 },
    ];
    const out = computeDriveCorrection(positions)!;
    expect(out.power_max).toBe(50);
    expect(out.power_min).toBe(-30); // régénération
    expect(out.outside_temp_avg).toBe(11); // (10+12)/2
    expect(out.inside_temp_avg).toBe(22); // (21+23)/2
  });
});

describe("integrity/drives — selectTrailingToAbsorb", () => {
  const mk = (
    id: number,
    opts: { drive_id?: number | null; speed?: number | null } = {},
  ): AbsorbCandidate => ({
    id,
    date: new Date(2024, 0, 1, 10, id),
    latitude: 48,
    longitude: 2,
    drive_id: opts.drive_id ?? null,
    speed: opts.speed ?? null,
  });

  it("absorbe les orphelines jusqu'à l'arrêt (speed=0) inclus", () => {
    const out = selectTrailingToAbsorb([
      mk(1, { speed: 40 }),
      mk(2, { speed: 20 }),
      mk(3, { speed: 0 }),
      mk(4, { speed: 30 }),
    ]);
    expect(out.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("s'arrête si une position appartient déjà à un trajet", () => {
    const out = selectTrailingToAbsorb([
      mk(1, { speed: 40 }),
      mk(2, { drive_id: 99, speed: 40 }),
      mk(3, { speed: 0 }),
    ]);
    expect(out.map((p) => p.id)).toEqual([1]);
  });

  it("ignore speed=null (ne s'arrête pas)", () => {
    const out = selectTrailingToAbsorb([
      mk(1, { speed: null }),
      mk(2, { speed: null }),
      mk(3, { speed: 0 }),
    ]);
    expect(out.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("renvoie une liste vide si la 1re position appartient à un trajet", () => {
    expect(selectTrailingToAbsorb([mk(1, { drive_id: 5 })])).toEqual([]);
  });
});
