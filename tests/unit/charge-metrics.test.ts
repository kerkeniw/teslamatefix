import { describe, expect, it } from "vitest";
import {
  avgPowerKw,
  chargeEfficiencyPct,
  costPerKwh,
  isSuspectEfficiency,
  isSuspectEnergy,
} from "@/lib/charges/metrics";

describe("charges/metrics", () => {
  it("efficience = ajoutée / consommée", () => {
    expect(chargeEfficiencyPct({ charge_energy_added: 9, charge_energy_used: 10 })).toBe(90);
  });

  it("efficience inconnue sans énergie consommée", () => {
    expect(chargeEfficiencyPct({ charge_energy_added: 9, charge_energy_used: null })).toBeNull();
    expect(chargeEfficiencyPct({ charge_energy_added: 9, charge_energy_used: 0 })).toBeNull();
  });

  it("cas réel aberrant (#149 : 47,1 / 511,65) : efficience et énergie suspectes", () => {
    const eff = chargeEfficiencyPct({ charge_energy_added: 47.1, charge_energy_used: 511.65 });
    expect(eff).toBeCloseTo(9.2, 1);
    expect(isSuspectEfficiency(eff)).toBe(true);
    expect(isSuspectEnergy(511.65)).toBe(true);
    expect(isSuspectEnergy(63.3)).toBe(false);
  });

  it("coût / kWh rapporté au max(consommée, ajoutée)", () => {
    expect(costPerKwh({ cost: 2, charge_energy_added: 9, charge_energy_used: 10 })).toBe(0.2);
    expect(costPerKwh({ cost: 2, charge_energy_added: null, charge_energy_used: null })).toBeNull();
  });

  it("puissance moyenne = énergie × 60 / durée", () => {
    expect(avgPowerKw({ charge_energy_added: 11, duration_min: 60 })).toBe(11);
    expect(avgPowerKw({ charge_energy_added: 11, duration_min: 0 })).toBeNull();
  });
});
