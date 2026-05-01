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
    update: vi.fn(),
  },
  charges: {
    aggregate: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    charging_processes: mocks.charging_processes,
    charges: mocks.charges,
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

import { recalcFromTicks } from "@/lib/integrity/charges";

beforeEach(() => {
  mocks.charging_processes.findUnique.mockReset();
  mocks.charging_processes.update.mockReset();
  mocks.charges.aggregate.mockReset();
  mocks.charges.findFirst.mockReset();
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
