import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Mock complet de `@/lib/db` pour éviter toute connexion Prisma réelle.
 * Les tests sont 100% en mémoire et idempotents.
 *
 * Note vitest : `vi.mock` est hissé en haut du fichier ; on utilise
 * `vi.hoisted` pour partager l'objet de mocks avec les `it`.
 */
const mocks = vi.hoisted(() => ({
  charging_processes: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  charges: {
    aggregate: vi.fn(),
    findFirst: vi.fn(),
  },
  cars: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    charging_processes: mocks.charging_processes,
    charges: mocks.charges,
    cars: mocks.cars,
  },
}));

// On mocke aussi `@prisma/client` pour fournir un `Prisma.Decimal` minimal
// (utilisé par `applyRecalc`). Le test n'invoque pas `applyRecalc`, mais
// l'import en tête du fichier `charges.ts` doit résoudre.
vi.mock("@prisma/client", () => {
  class Decimal {
    private v: number;
    constructor(v: number | string) {
      this.v = typeof v === "string" ? parseFloat(v) : v;
    }
    toString() {
      return String(this.v);
    }
  }
  return { Prisma: { Decimal } };
});

import { recalcFromTicks, findOverlappingSession } from "@/lib/integrity/charges";
import {
  estimateBatteryCapacityKwh,
  deriveEndFields,
} from "@/lib/integrity/charges-derive";

beforeEach(() => {
  mocks.charging_processes.findUnique.mockReset();
  mocks.charging_processes.findFirst.mockReset();
  mocks.charging_processes.findMany.mockReset();
  mocks.charging_processes.update.mockReset();
  mocks.charges.aggregate.mockReset();
  mocks.charges.findFirst.mockReset();
  mocks.cars.findUnique.mockReset();
});

describe("integrity/charges — recalcFromTicks", () => {
  it("throw si le charging_process n'existe pas", async () => {
    mocks.charging_processes.findUnique.mockResolvedValue(null);
    await expect(recalcFromTicks(42)).rejects.toThrow(/not found/);
  });

  it("retourne after = before quand aucun tick (count=0)", async () => {
    const proc = {
      start_date: new Date("2024-01-01T10:00:00Z"),
      end_date: new Date("2024-01-01T11:00:00Z"),
      duration_min: 60,
      charge_energy_added: { toString: () => "12.5" },
      start_battery_level: 20,
      end_battery_level: 80,
    };
    mocks.charging_processes.findUnique.mockResolvedValue(proc);
    mocks.charges.aggregate.mockResolvedValue({
      _min: { date: null, battery_level: null },
      _max: { date: null, battery_level: null, charge_energy_added: null },
      _count: { _all: 0 },
    });

    const { before, after } = await recalcFromTicks(1);
    expect(before.duration_min).toBe(60);
    expect(after).toEqual({ ...before });
    // Pas de findFirst quand aucun tick
    expect(mocks.charges.findFirst).not.toHaveBeenCalled();
  });

  it("recalcule à partir des ticks (charge_energy_added = MAX, battery_level = first/last)", async () => {
    const proc = {
      start_date: new Date("2024-01-01T08:00:00Z"),
      end_date: new Date("2024-01-01T08:30:00Z"),
      duration_min: 30,
      charge_energy_added: { toString: () => "5" },
      start_battery_level: 30,
      end_battery_level: 50,
    };
    mocks.charging_processes.findUnique.mockResolvedValue(proc);
    mocks.charges.aggregate.mockResolvedValue({
      _min: { date: new Date("2024-01-01T10:00:00Z"), battery_level: 25 },
      _max: {
        date: new Date("2024-01-01T11:00:00Z"),
        battery_level: 90,
        charge_energy_added: { toString: () => "42.7" },
      },
      _count: { _all: 5 },
    });
    mocks.charges.findFirst
      .mockResolvedValueOnce({ battery_level: 25 }) // ASC -> first
      .mockResolvedValueOnce({ battery_level: 90 }); // DESC -> last

    const { after } = await recalcFromTicks(1);
    expect(after.start_date).toEqual(new Date("2024-01-01T10:00:00Z"));
    expect(after.end_date).toEqual(new Date("2024-01-01T11:00:00Z"));
    expect(after.duration_min).toBe(60);
    expect(after.charge_energy_added).toBe(42.7);
    expect(after.start_battery_level).toBe(25);
    expect(after.end_battery_level).toBe(90);
  });

  it("battery_level chronologique correct même si MIN/MAX trompeurs", async () => {
    // Cas où le SOC chute en début de session puis remonte : MIN aggregate
    // serait faux ; on doit prendre le premier tick chronologique.
    const proc = {
      start_date: new Date("2024-01-01T10:00:00Z"),
      end_date: new Date("2024-01-01T11:00:00Z"),
      duration_min: 60,
      charge_energy_added: null,
      start_battery_level: null,
      end_battery_level: null,
    };
    mocks.charging_processes.findUnique.mockResolvedValue(proc);
    mocks.charges.aggregate.mockResolvedValue({
      _min: { date: new Date("2024-01-01T10:00:00Z"), battery_level: 10 },
      _max: {
        date: new Date("2024-01-01T11:00:00Z"),
        battery_level: 80,
        charge_energy_added: null,
      },
      _count: { _all: 3 },
    });
    // Premier tick (date ASC) : 50%. Dernier tick (date DESC) : 80%.
    mocks.charges.findFirst
      .mockResolvedValueOnce({ battery_level: 50 })
      .mockResolvedValueOnce({ battery_level: 80 });

    const { after } = await recalcFromTicks(2);
    expect(after.start_battery_level).toBe(50);
    expect(after.end_battery_level).toBe(80);
    expect(after.charge_energy_added).toBeNull();
  });
});

describe("integrity/charges-derive — estimateBatteryCapacityKwh", () => {
  it("retourne null si aucune charge historique", async () => {
    mocks.charging_processes.findMany.mockResolvedValue([]);
    const capacity = await estimateBatteryCapacityKwh(1);
    expect(capacity).toBeNull();
  });

  it("retourne ~75 kWh à partir de 5 charges synthétiques (7.5 kWh / +10% SOC)", async () => {
    mocks.charging_processes.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({
        start_battery_level: 30,
        end_battery_level: 40,
        charge_energy_added: { toString: () => "7.5" },
      })),
    );
    const capacity = await estimateBatteryCapacityKwh(1);
    expect(capacity).toBeCloseTo(75, 1);
  });

  it("ignore les charges avec delta SOC < 5%", async () => {
    mocks.charging_processes.findMany.mockResolvedValue([
      { start_battery_level: 50, end_battery_level: 52, charge_energy_added: { toString: () => "1.5" } },
      { start_battery_level: 30, end_battery_level: 40, charge_energy_added: { toString: () => "7.5" } },
    ]);
    const capacity = await estimateBatteryCapacityKwh(1);
    expect(capacity).toBeCloseTo(75, 1);
  });
});

describe("integrity/charges-derive — deriveEndFields", () => {
  it("clamp end_battery_level à 100", async () => {
    mocks.cars.findUnique.mockResolvedValue({ efficiency: 150 });
    // historique permettant d'estimer une capacité de 75 kWh
    mocks.charging_processes.findMany.mockResolvedValue([
      { start_battery_level: 30, end_battery_level: 40, charge_energy_added: { toString: () => "7.5" } },
      { start_ideal_range_km: { toString: () => "100" }, start_rated_range_km: { toString: () => "85" } },
    ]);

    const derived = await deriveEndFields({
      car_id: 1,
      start_battery_level: 90,
      start_ideal_range_km: 500,
      start_rated_range_km: 425,
      charge_energy_added: 50, // ajouterait ~66% SOC, donc clampé à 100
    });
    expect(derived.end_battery_level).toBe(100);
  });

  it("retourne ranges null si efficiency est null", async () => {
    mocks.cars.findUnique.mockResolvedValue({ efficiency: null });
    mocks.charging_processes.findMany.mockResolvedValue([]);
    const derived = await deriveEndFields({
      car_id: 1,
      start_battery_level: 20,
      start_ideal_range_km: 100,
      start_rated_range_km: 85,
      charge_energy_added: 10,
    });
    expect(derived.end_ideal_range_km).toBeNull();
    expect(derived.end_rated_range_km).toBeNull();
  });

  it("retourne tout à null si charge_energy_added est null ou 0", async () => {
    const a = await deriveEndFields({
      car_id: 1,
      start_battery_level: 20,
      start_ideal_range_km: 100,
      start_rated_range_km: 85,
      charge_energy_added: null,
    });
    expect(a).toEqual({
      end_battery_level: null,
      end_ideal_range_km: null,
      end_rated_range_km: null,
    });
  });
});

describe("integrity/charges — findOverlappingSession", () => {
  it("détecte un chevauchement strict", async () => {
    mocks.charging_processes.findFirst.mockResolvedValue({
      id: 99,
      start_date: new Date("2024-01-01T10:00:00Z"),
      end_date: new Date("2024-01-01T11:00:00Z"),
    });
    const overlap = await findOverlappingSession(
      1,
      new Date("2024-01-01T10:30:00Z"),
      new Date("2024-01-01T11:30:00Z"),
      null,
    );
    expect(overlap?.id).toBe(99);
    const args = mocks.charging_processes.findFirst.mock.calls[0][0];
    expect(args.where.car_id).toBe(1);
    expect(args.where.start_date).toEqual({ lt: new Date("2024-01-01T11:30:00Z") });
  });

  it("exclut self via excludeId pour l'édition", async () => {
    mocks.charging_processes.findFirst.mockResolvedValue(null);
    await findOverlappingSession(
      1,
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
      42,
    );
    const args = mocks.charging_processes.findFirst.mock.calls[0][0];
    expect(args.where.id).toEqual({ not: 42 });
  });

  it("cas open-ended : refus si une session ouverte existe", async () => {
    mocks.charging_processes.findFirst.mockResolvedValue({
      id: 7,
      start_date: new Date("2024-01-01T08:00:00Z"),
      end_date: null,
    });
    const overlap = await findOverlappingSession(
      1,
      new Date("2024-01-01T12:00:00Z"),
      null,
      null,
    );
    expect(overlap?.id).toBe(7);
    const args = mocks.charging_processes.findFirst.mock.calls[0][0];
    expect(args.where.OR).toBeDefined();
  });
});
