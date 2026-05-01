import { describe, expect, it } from "vitest";
import {
  computeRecalcFromPositions,
  haversineKm,
  type DriveRecalcPosition,
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
