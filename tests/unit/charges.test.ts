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
    findUnique: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
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

import {
  recalcFromTicks,
  findOverlappingSession,
  deriveChargerTypeFromTicks,
  validateDateBoundsAgainstTicks,
  deriveChargerTicksContext,
  propagateBoundDatesToTicks,
  deriveTickFieldSuggestions,
} from "@/lib/integrity/charges";
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
  mocks.charges.findUnique.mockReset();
  mocks.charges.findMany.mockReset();
  mocks.charges.groupBy.mockReset();
  mocks.charges.update.mockReset();
  mocks.charges.updateMany.mockReset();
  mocks.charges.create.mockReset();
  mocks.charges.count.mockReset();
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

describe("integrity/charges — deriveChargerTypeFromTicks", () => {
  it("DC pur", async () => {
    mocks.charges.groupBy.mockResolvedValue([
      { fast_charger_present: true, _count: { _all: 12 } },
    ]);
    const r = await deriveChargerTypeFromTicks(1);
    expect(r.chargerType).toBe("DC");
    expect(r.trueCount).toBe(12);
    expect(r.falseCount).toBe(0);
    expect(r.fallbackFromLastTick).toBeNull();
    expect(mocks.charges.findFirst).not.toHaveBeenCalled();
  });

  it("AC pur", async () => {
    mocks.charges.groupBy.mockResolvedValue([
      { fast_charger_present: false, _count: { _all: 8 } },
    ]);
    const r = await deriveChargerTypeFromTicks(1);
    expect(r.chargerType).toBe("AC");
    expect(r.falseCount).toBe(8);
  });

  it("mixed → fallback DC depuis le dernier tick", async () => {
    mocks.charges.groupBy.mockResolvedValue([
      { fast_charger_present: true, _count: { _all: 5 } },
      { fast_charger_present: false, _count: { _all: 3 } },
    ]);
    mocks.charges.findFirst.mockResolvedValueOnce({ fast_charger_present: true });
    const r = await deriveChargerTypeFromTicks(1);
    expect(r.chargerType).toBe("mixed");
    expect(r.fallbackFromLastTick).toBe("DC");
  });

  it("mixed → fallback AC depuis le dernier tick", async () => {
    mocks.charges.groupBy.mockResolvedValue([
      { fast_charger_present: true, _count: { _all: 2 } },
      { fast_charger_present: false, _count: { _all: 9 } },
    ]);
    mocks.charges.findFirst.mockResolvedValueOnce({ fast_charger_present: false });
    const r = await deriveChargerTypeFromTicks(1);
    expect(r.chargerType).toBe("mixed");
    expect(r.fallbackFromLastTick).toBe("AC");
  });

  it("tous null → unknown", async () => {
    mocks.charges.groupBy.mockResolvedValue([
      { fast_charger_present: null, _count: { _all: 4 } },
    ]);
    const r = await deriveChargerTypeFromTicks(1);
    expect(r.chargerType).toBe("unknown");
    expect(r.nullCount).toBe(4);
  });

  it("aucun tick → unknown", async () => {
    mocks.charges.groupBy.mockResolvedValue([]);
    const r = await deriveChargerTypeFromTicks(1);
    expect(r.chargerType).toBe("unknown");
    expect(r.trueCount).toBe(0);
    expect(r.falseCount).toBe(0);
    expect(r.nullCount).toBe(0);
  });
});

describe("integrity/charges — validateDateBoundsAgainstTicks", () => {
  it("< 2 ticks → aucune erreur", async () => {
    mocks.charges.findFirst
      .mockResolvedValueOnce(null) // secondTick
      .mockResolvedValueOnce(null); // penultimateTick
    const errs = await validateDateBoundsAgainstTicks(
      1,
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
    );
    expect(errs).toEqual({});
  });

  it("bornes valides → aucune erreur", async () => {
    mocks.charges.findFirst
      .mockResolvedValueOnce({ date: new Date("2024-01-01T10:05:00Z") }) // second
      .mockResolvedValueOnce({ date: new Date("2024-01-01T10:55:00Z") }); // penultimate
    const errs = await validateDateBoundsAgainstTicks(
      1,
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
    );
    expect(errs).toEqual({});
  });

  it("start >= second tick → startAfterSecondTick", async () => {
    mocks.charges.findFirst
      .mockResolvedValueOnce({ date: new Date("2024-01-01T10:05:00Z") })
      .mockResolvedValueOnce({ date: new Date("2024-01-01T10:55:00Z") });
    const errs = await validateDateBoundsAgainstTicks(
      1,
      new Date("2024-01-01T10:10:00Z"),
      new Date("2024-01-01T11:00:00Z"),
    );
    expect(errs.start_date).toBe("startAfterSecondTick");
  });

  it("end <= penultimate tick → endBeforeOrEqualPenultimateTick", async () => {
    mocks.charges.findFirst
      .mockResolvedValueOnce({ date: new Date("2024-01-01T10:05:00Z") })
      .mockResolvedValueOnce({ date: new Date("2024-01-01T10:55:00Z") });
    const errs = await validateDateBoundsAgainstTicks(
      1,
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T10:50:00Z"),
    );
    expect(errs.end_date).toBe("endBeforeOrEqualPenultimateTick");
  });

  it("end null → aucune contrainte fin appliquée", async () => {
    mocks.charges.findFirst
      .mockResolvedValueOnce({ date: new Date("2024-01-01T10:05:00Z") })
      .mockResolvedValueOnce({ date: new Date("2024-01-01T10:55:00Z") });
    const errs = await validateDateBoundsAgainstTicks(
      1,
      new Date("2024-01-01T10:00:00Z"),
      null,
    );
    expect(errs.end_date).toBeUndefined();
  });
});

describe("integrity/charges — deriveChargerTicksContext", () => {
  it("session à 1 tick → uniform partout", async () => {
    mocks.charges.findMany.mockResolvedValue([
      {
        charger_voltage: 240,
        charger_phases: 2,
        charger_actual_current: 16,
        charger_pilot_current: 16,
        charger_power: 11,
        conn_charge_cable: "IEC",
        fast_charger_brand: "<invalid>",
        fast_charger_type: "<invalid>",
        battery_heater_on: false,
        battery_heater: false,
      },
    ]);
    const ctx = await deriveChargerTicksContext(1);
    expect(ctx.ticksCount).toBe(1);
    expect(ctx.lastTickValues.charger_voltage).toBe(240);
    expect(ctx.stats.charger_voltage.uniform).toBe(true);
    expect(ctx.stats.charger_voltage.distinct).toEqual(["240"]);
  });

  it("3 ticks voltage [220, 230, 230] → min=220, max=230, last=230", async () => {
    mocks.charges.findMany.mockResolvedValue([
      { charger_voltage: 220, charger_phases: null, charger_actual_current: null, charger_pilot_current: null, charger_power: 7, conn_charge_cable: "IEC", fast_charger_brand: null, fast_charger_type: null, battery_heater_on: null, battery_heater: null },
      { charger_voltage: 230, charger_phases: null, charger_actual_current: null, charger_pilot_current: null, charger_power: 7, conn_charge_cable: "IEC", fast_charger_brand: null, fast_charger_type: null, battery_heater_on: null, battery_heater: null },
      { charger_voltage: 230, charger_phases: null, charger_actual_current: null, charger_pilot_current: null, charger_power: 7, conn_charge_cable: "IEC", fast_charger_brand: null, fast_charger_type: null, battery_heater_on: null, battery_heater: null },
    ]);
    const ctx = await deriveChargerTicksContext(1);
    expect(ctx.lastTickValues.charger_voltage).toBe(230);
    expect(ctx.stats.charger_voltage.uniform).toBe(false);
    expect(ctx.stats.charger_voltage.min).toBe(220);
    expect(ctx.stats.charger_voltage.max).toBe(230);
    // charger_power uniforme
    expect(ctx.stats.charger_power.uniform).toBe(true);
  });

  it("mix textes IEC / CCS → distinct trié", async () => {
    mocks.charges.findMany.mockResolvedValue([
      { charger_voltage: null, charger_phases: null, charger_actual_current: null, charger_pilot_current: null, charger_power: 50, conn_charge_cable: "CCS", fast_charger_brand: "Tesla", fast_charger_type: "Combo", battery_heater_on: null, battery_heater: null },
      { charger_voltage: null, charger_phases: null, charger_actual_current: null, charger_pilot_current: null, charger_power: 50, conn_charge_cable: "IEC", fast_charger_brand: "Tesla", fast_charger_type: "Combo", battery_heater_on: null, battery_heater: null },
    ]);
    const ctx = await deriveChargerTicksContext(1);
    expect(ctx.stats.conn_charge_cable.uniform).toBe(false);
    expect(ctx.stats.conn_charge_cable.distinct).toEqual(["CCS", "IEC"]);
    expect(ctx.lastTickValues.conn_charge_cable).toBe("IEC");
  });

  it("aucun tick → stats vides", async () => {
    mocks.charges.findMany.mockResolvedValue([]);
    const ctx = await deriveChargerTicksContext(1);
    expect(ctx.ticksCount).toBe(0);
    expect(ctx.lastTickValues.charger_voltage).toBeNull();
    expect(ctx.stats.charger_voltage.uniform).toBe(true);
    expect(ctx.stats.charger_voltage.distinct).toEqual([]);
  });
});

describe("integrity/charges — propagateBoundDatesToTicks", () => {
  function makeTx() {
    return {
      charges: {
        findMany: mocks.charges.findMany,
        findUnique: mocks.charges.findUnique,
        update: mocks.charges.update,
        create: mocks.charges.create,
      },
    } as unknown as Parameters<typeof propagateBoundDatesToTicks>[0];
  }

  it("0 tick → no-op", async () => {
    mocks.charges.findMany.mockResolvedValueOnce([]);
    const r = await propagateBoundDatesToTicks(
      makeTx(),
      1,
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
    );
    expect(r).toEqual({ ticksAdjusted: 0, ticksCreated: 0 });
    expect(mocks.charges.update).not.toHaveBeenCalled();
    expect(mocks.charges.create).not.toHaveBeenCalled();
  });

  it("1 tick → 1 ajusté + 1 créé", async () => {
    mocks.charges.findMany.mockResolvedValueOnce([
      { id: 100, date: new Date("2024-01-01T10:30:00Z") },
    ]);
    mocks.charges.findUnique.mockResolvedValueOnce({
      id: 100,
      date: new Date("2024-01-01T10:30:00Z"),
      charging_process_id: 1,
      charger_voltage: 240,
      charger_phases: 2,
      charger_actual_current: 16,
      charger_pilot_current: 16,
      charger_power: 11,
      charge_energy_added: { toString: () => "0" },
      battery_level: 30,
      usable_battery_level: 30,
      ideal_battery_range_km: { toString: () => "100" },
      rated_battery_range_km: { toString: () => "85" },
      fast_charger_present: false,
      conn_charge_cable: "IEC",
      fast_charger_brand: "<invalid>",
      fast_charger_type: "<invalid>",
      battery_heater_on: false,
      battery_heater: false,
      outside_temp: null,
      battery_heater_no_power: null,
    });
    const r = await propagateBoundDatesToTicks(
      makeTx(),
      1,
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
      { end_battery_level: 60, end_charge_energy_added: 12.5 },
    );
    expect(r).toEqual({ ticksAdjusted: 1, ticksCreated: 1 });
    expect(mocks.charges.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { date: new Date("2024-01-01T10:00:00Z") },
    });
    const createArg = mocks.charges.create.mock.calls[0][0];
    expect(createArg.data.date).toEqual(new Date("2024-01-01T11:00:00Z"));
    expect(createArg.data.battery_level).toBe(60);
    expect(createArg.data.usable_battery_level).toBe(60);
    expect(createArg.data.id).toBeUndefined();
  });

  it("2 ticks dates inchangées → no-op", async () => {
    mocks.charges.findMany.mockResolvedValueOnce([
      { id: 100, date: new Date("2024-01-01T10:00:00Z") },
      { id: 101, date: new Date("2024-01-01T11:00:00Z") },
    ]);
    const r = await propagateBoundDatesToTicks(
      makeTx(),
      1,
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
    );
    expect(r).toEqual({ ticksAdjusted: 0, ticksCreated: 0 });
    expect(mocks.charges.update).not.toHaveBeenCalled();
  });

  it("2 ticks start changée → 1 ajusté", async () => {
    mocks.charges.findMany.mockResolvedValueOnce([
      { id: 100, date: new Date("2024-01-01T10:00:00Z") },
      { id: 101, date: new Date("2024-01-01T11:00:00Z") },
    ]);
    const r = await propagateBoundDatesToTicks(
      makeTx(),
      1,
      new Date("2024-01-01T09:55:00Z"),
      new Date("2024-01-01T11:00:00Z"),
    );
    expect(r).toEqual({ ticksAdjusted: 1, ticksCreated: 0 });
    expect(mocks.charges.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { date: new Date("2024-01-01T09:55:00Z") },
    });
  });

  it("2 ticks les deux dates changées → 2 ajustés", async () => {
    mocks.charges.findMany.mockResolvedValueOnce([
      { id: 100, date: new Date("2024-01-01T10:00:00Z") },
      { id: 101, date: new Date("2024-01-01T11:00:00Z") },
    ]);
    const r = await propagateBoundDatesToTicks(
      makeTx(),
      1,
      new Date("2024-01-01T09:55:00Z"),
      new Date("2024-01-01T11:05:00Z"),
    );
    expect(r).toEqual({ ticksAdjusted: 2, ticksCreated: 0 });
    expect(mocks.charges.update).toHaveBeenCalledTimes(2);
  });
});

describe("integrity/charges — deriveTickFieldSuggestions", () => {
  it("aucun tick → buckets vides", async () => {
    mocks.charges.findMany.mockResolvedValueOnce([]);
    const r = await deriveTickFieldSuggestions();
    expect(r.AC.conn_charge_cable).toEqual([]);
    expect(r.DC.conn_charge_cable).toEqual([]);
    expect(r.AC.fast_charger_brand).toEqual([]);
    expect(r.DC.fast_charger_brand).toEqual([]);
  });

  it("ticks AC purs → suggestions AC remplies, DC vides", async () => {
    mocks.charges.findMany.mockResolvedValueOnce([
      { fast_charger_present: false, conn_charge_cable: "IEC", fast_charger_brand: "<invalid>", fast_charger_type: "<invalid>" },
      { fast_charger_present: false, conn_charge_cable: "IEC", fast_charger_brand: "<invalid>", fast_charger_type: "<invalid>" },
    ]);
    const r = await deriveTickFieldSuggestions();
    expect(r.AC.conn_charge_cable).toEqual(["IEC"]);
    expect(r.AC.fast_charger_brand).toEqual(["<invalid>"]);
    expect(r.AC.fast_charger_type).toEqual(["<invalid>"]);
    expect(r.DC.conn_charge_cable).toEqual([]);
  });

  it("mix AC/DC → buckets séparés", async () => {
    mocks.charges.findMany.mockResolvedValueOnce([
      { fast_charger_present: false, conn_charge_cable: "IEC", fast_charger_brand: "<invalid>", fast_charger_type: "<invalid>" },
      { fast_charger_present: true, conn_charge_cable: "IEC", fast_charger_brand: "Tesla", fast_charger_type: "Combo" },
      { fast_charger_present: true, conn_charge_cable: "CCS", fast_charger_brand: "ABB", fast_charger_type: "CCS" },
    ]);
    const r = await deriveTickFieldSuggestions();
    expect(r.AC.fast_charger_brand).toEqual(["<invalid>"]);
    expect(r.DC.fast_charger_brand).toEqual(["ABB", "Tesla"]);
    expect(r.DC.conn_charge_cable).toEqual(["CCS", "IEC"]);
    expect(r.DC.fast_charger_type).toEqual(["CCS", "Combo"]);
  });

  it("ignore les ticks à fast_charger_present null", async () => {
    mocks.charges.findMany.mockResolvedValueOnce([
      { fast_charger_present: null, conn_charge_cable: "IEC", fast_charger_brand: "ignored", fast_charger_type: "ignored" },
      { fast_charger_present: false, conn_charge_cable: "IEC", fast_charger_brand: "<invalid>", fast_charger_type: "<invalid>" },
    ]);
    const r = await deriveTickFieldSuggestions();
    expect(r.AC.fast_charger_brand).toEqual(["<invalid>"]);
    expect(r.DC.fast_charger_brand).toEqual([]);
    // "ignored" doit n'apparaître nulle part
    expect(r.AC.fast_charger_brand).not.toContain("ignored");
    expect(r.DC.fast_charger_brand).not.toContain("ignored");
  });
});

// On importe le schéma depuis le module isolé (cf. actions.ts qui est
// "use server" et ne peut donc exporter de constantes Zod).
import { ChargeSchema } from "@/app/[locale]/charges/schema";

describe("actions/charges — ChargeSchema coercions", () => {
  /**
   * En production, le navigateur envoie `""` pour les inputs vides — pas
   * `undefined`. On reproduit ce comportement pour que safeParse ait des
   * valeurs string par défaut sur tous les champs requis par les `z.string()`.
   */
  function baseInput(): Record<string, string> {
    return {
      car_id: "1",
      position_id: "1",
      start_date: "2024-01-01T10:00:00Z",
      end_date: "",
      charge_energy_added: "",
      charge_energy_used: "",
      cost: "",
      start_battery_level: "",
      end_battery_level: "",
      start_ideal_range_km: "",
      end_ideal_range_km: "",
      start_rated_range_km: "",
      end_rated_range_km: "",
      address_id: "",
      geofence_id: "",
      outside_temp_avg: "",
    };
  }

  it("charger_voltage \"240\" → number 240", () => {
    const r = ChargeSchema.safeParse({ ...baseInput(), charger_voltage: "240" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.charger_voltage).toBe(240);
      expect(typeof r.data.charger_voltage).toBe("number");
    }
  });

  it("charger_phases \"\" → null", () => {
    const r = ChargeSchema.safeParse({ ...baseInput(), charger_phases: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.charger_phases).toBeNull();
  });

  it("charger_power absent (default) → null", () => {
    const r = ChargeSchema.safeParse(baseInput());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.charger_power).toBeNull();
  });

  it("charger_voltage \"abc\" → erreur invalidNumber", () => {
    const r = ChargeSchema.safeParse({ ...baseInput(), charger_voltage: "abc" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === "charger_voltage");
      expect(issue?.message).toBe("invalidNumber");
    }
  });

  it("fast_charger_brand \"Tesla\" → string \"Tesla\"", () => {
    const r = ChargeSchema.safeParse({ ...baseInput(), fast_charger_brand: "Tesla" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fast_charger_brand).toBe("Tesla");
  });

  it("battery_heater_on \"true\"/\"false\" → bool", () => {
    const rTrue = ChargeSchema.safeParse({ ...baseInput(), battery_heater_on: "true" });
    expect(rTrue.success).toBe(true);
    if (rTrue.success) expect(rTrue.data.battery_heater_on).toBe(true);

    const rFalse = ChargeSchema.safeParse({ ...baseInput(), battery_heater_on: "false" });
    expect(rFalse.success).toBe(true);
    if (rFalse.success) expect(rFalse.data.battery_heater_on).toBe(false);
  });

  it("charger_voltage_initial garde la même coercion (number)", () => {
    const r = ChargeSchema.safeParse({
      ...baseInput(),
      charger_voltage: "240",
      charger_voltage_initial: "220",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.charger_voltage).toBe(240);
      expect(r.data.charger_voltage_initial).toBe(220);
      // Comparaison d'idempotence côté serveur reste possible.
      expect(r.data.charger_voltage === r.data.charger_voltage_initial).toBe(false);
    }
  });
});
