import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  computeDeltas,
  matchesFilters,
  type FilterablePosition,
} from "@/lib/positions/drive-filters";
import { countOrigins, isReconstructed, originFromColumns } from "@/lib/positions/origin";

/** Origine des positions (docs/ORIGINE_POSITIONS.md) et filtres du tableau d'un trajet. */

describe("originFromColumns", () => {
  it("vehicle_data si une autonomie est remplie", () => {
    expect(originFromColumns({ ideal_battery_range_km: "312.4", rated_battery_range_km: null })).toBe(
      "vehicle_data",
    );
    expect(originFromColumns({ ideal_battery_range_km: null, rated_battery_range_km: 280 })).toBe(
      "vehicle_data",
    );
  });

  it("flux si les deux autonomies sont vides", () => {
    expect(originFromColumns({ ideal_battery_range_km: null, rated_battery_range_km: null })).toBe("flux");
  });

  it("compte et signale les données reconstruites", () => {
    const c = countOrigins(["flux", "flux", "d13", "flux_complete", "vehicle_data"]);
    expect(c).toEqual({ vehicle_data: 1, flux: 2, flux_complete: 1, d13: 1 });
    expect(isReconstructed("d13")).toBe(true);
    expect(isReconstructed("flux_complete")).toBe(true);
    expect(isReconstructed("flux")).toBe(false);
  });
});

const base = "2026-10-09T08:00:00.000Z";
function at(s: number) {
  return new Date(new Date(base).getTime() + s * 1000).toISOString();
}

// ~111 m par millième de degré de latitude.
const rows: FilterablePosition[] = [
  { date: at(0), lat: 48.0, lng: 2.0, origin: "vehicle_data", v: { speed: 0, power: 2, elevation: 40 } },
  { date: at(1), lat: 48.0001, lng: 2.0, origin: "flux", v: { speed: 30, power: 15 } },
  { date: at(2), lat: 48.0002, lng: 2.0, origin: "flux", v: { speed: 50, power: -12, elevation: 41 } },
  { date: at(62), lat: 48.0102, lng: 2.0, origin: "d13", v: { speed: 90, power: 40, elevation: 45 } },
];

describe("computeDeltas", () => {
  it("écart en secondes et distance en mètres avec la position précédente", () => {
    const d = computeDeltas(rows);
    expect(d[0]).toEqual({ dtS: null, dM: null });
    expect(d[1].dtS).toBe(1);
    expect(d[1].dM).toBeCloseTo(11.1, 0);
    expect(d[3].dtS).toBe(60);
    expect(d[3].dM).toBeCloseTo(1112, -1);
  });
});

describe("matchesFilters", () => {
  const deltas = computeDeltas(rows);
  const keep = (f: Partial<typeof EMPTY_FILTERS>) =>
    rows.filter((r, i) => matchesFilters(r, deltas[i], { ...EMPTY_FILTERS, ...f })).map((r) => r.date);

  it("sans filtre, tout passe", () => {
    expect(keep({})).toHaveLength(4);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it("par origine", () => {
    expect(keep({ origins: ["flux"] })).toEqual([at(1), at(2)]);
    expect(keep({ origins: ["d13", "vehicle_data"] })).toEqual([at(0), at(62)]);
  });

  it("par plage de vitesse et de puissance (régénération)", () => {
    expect(keep({ speedMin: 40 })).toEqual([at(2), at(62)]);
    expect(keep({ speedMin: 20, speedMax: 60 })).toEqual([at(1), at(2)]);
    expect(keep({ powerMax: -1 })).toEqual([at(2)]);
  });

  it("par colonne vide", () => {
    expect(keep({ emptyColumn: "elevation" })).toEqual([at(1)]);
  });

  it("trous de collecte et sauts GPS", () => {
    expect(keep({ gapMinS: 30 })).toEqual([at(62)]);
    expect(keep({ jumpMinM: 500 })).toEqual([at(62)]);
    expect(activeFilterCount({ ...EMPTY_FILTERS, gapMinS: 30, origins: ["flux"] })).toBe(2);
  });
});
