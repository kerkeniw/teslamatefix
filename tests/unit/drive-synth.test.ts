import { describe, expect, it } from "vitest";
import { synthesizeDrive, type SynthesizeInput } from "@/lib/integrity/drive-synth";
import type { LatLon } from "@/lib/geo/route";

/**
 * Tests purs sur la synthèse de trajet + positions. N'utilise ni Prisma ni
 * réseau : on fournit une géométrie et un état de départ, on vérifie les
 * invariants (échantillonnage temporel, odomètre monotone, autonomie décroissante).
 */

// Petit trajet Paris centre → est, ~5 coordonnées.
const COORDS: LatLon[] = [
  { lat: 48.8566, lon: 2.3522 },
  { lat: 48.858, lon: 2.36 },
  { lat: 48.86, lon: 2.37 },
  { lat: 48.862, lon: 2.38 },
  { lat: 48.8641, lon: 2.3899 },
];

function baseInput(overrides: Partial<SynthesizeInput> = {}): SynthesizeInput {
  return {
    carId: 1,
    coordinates: COORDS,
    distanceKm: 6,
    durationS: 600, // 10 min
    startDate: new Date("2024-01-01T08:00:00Z"),
    startState: {
      odometerKm: 10000,
      batteryLevel: 80,
      idealRangeKm: 400,
      ratedRangeKm: 360,
      outsideTemp: 12,
      insideTemp: 21,
    },
    consumptionWhKm: 170,
    ratedWhKm: 150,
    ...overrides,
  };
}

describe("integrity/drive-synth — synthesizeDrive", () => {
  it("échantillonne ~toutes les 30 s, départ et arrivée inclus", () => {
    const { positions } = synthesizeDrive(baseInput());
    // 600 s / 30 s = 20 pas + le point final = 21 positions.
    expect(positions.length).toBe(21);
    expect(positions[0].date.toISOString()).toBe("2024-01-01T08:00:00.000Z");
    expect(positions[positions.length - 1].date.toISOString()).toBe(
      "2024-01-01T08:10:00.000Z",
    );
  });

  it("odomètre monotone croissant, départ = start_km, fin = start+distance", () => {
    const { positions, drive } = synthesizeDrive(baseInput());
    expect(positions[0].odometer).toBeCloseTo(10000, 3);
    expect(positions[positions.length - 1].odometer).toBeCloseTo(10006, 3);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].odometer).toBeGreaterThanOrEqual(positions[i - 1].odometer);
    }
    expect(drive.start_km).toBe(10000);
    expect(drive.end_km).toBe(10006);
    expect(drive.distance).toBe(6);
    expect(drive.duration_min).toBe(10);
  });

  it("autonomie décroissante selon le modèle conso (factor = 170/150)", () => {
    const { positions, drive } = synthesizeDrive(baseInput());
    // consumed = distance × 170/150 = 6 × 1.1333 = 6.8 km d'autonomie estimée.
    expect(drive.start_rated_range_km).toBe(360);
    expect(drive.end_rated_range_km).toBeCloseTo(360 - 6.8, 1);
    expect(drive.start_ideal_range_km).toBe(400);
    expect(drive.end_ideal_range_km).toBeCloseTo(400 - 6.8, 1);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].rated_battery_range_km!).toBeLessThanOrEqual(
        positions[i - 1].rated_battery_range_km!,
      );
    }
  });

  it("niveau batterie décroît et reste dans [0,100]", () => {
    const { positions } = synthesizeDrive(baseInput());
    expect(positions[0].battery_level).toBe(80);
    const lastLevel = positions[positions.length - 1].battery_level!;
    expect(lastLevel).toBeLessThanOrEqual(80);
    expect(lastLevel).toBeGreaterThanOrEqual(0);
  });

  it("propage la température et calcule une vitesse max cohérente", () => {
    const { positions, drive } = synthesizeDrive(baseInput());
    expect(positions[0].outside_temp).toBe(12);
    expect(positions[0].inside_temp).toBe(21);
    expect(drive.outside_temp_avg).toBe(12);
    // 6 km en 10 min ≈ 36 km/h de moyenne.
    expect(drive.speed_max).toBeGreaterThan(0);
    expect(drive.speed_max).toBeLessThan(120);
  });

  it("gère un état de départ sans batterie (laisse le niveau nul)", () => {
    const { positions } = synthesizeDrive(
      baseInput({
        startState: {
          odometerKm: 500,
          batteryLevel: null,
          idealRangeKm: null,
          ratedRangeKm: null,
          outsideTemp: null,
          insideTemp: null,
        },
      }),
    );
    expect(positions[0].battery_level).toBeNull();
    expect(positions[0].rated_battery_range_km).toBeNull();
    expect(positions[positions.length - 1].odometer).toBeCloseTo(506, 3);
  });
});
