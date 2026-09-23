import { describe, expect, it } from "vitest";
import { computeChargeCost } from "@/lib/integrity/charge-cost";

const perKwh = { billing_type: "per_kwh" as const, cost_per_unit: 0.16, session_fee: null };

describe("integrity/charge-cost — computeChargeCost", () => {
  it("per_kwh : prend le max(consommée, ajoutée) — cas réel charge 297", () => {
    const r = computeChargeCost(perKwh, { energyUsed: 11.17, energyAdded: 10.6, durationMin: 157 });
    expect(r).toEqual({ cost: 1.79, quantity: 11.17 });
  });

  it("per_kwh : énergie ajoutée si elle dépasse la consommée", () => {
    const r = computeChargeCost(perKwh, { energyUsed: 5, energyAdded: 6, durationMin: null });
    expect(r?.quantity).toBe(6);
  });

  it("per_kwh : une seule énergie connue suffit", () => {
    expect(computeChargeCost(perKwh, { energyUsed: null, energyAdded: 10, durationMin: null })?.cost).toBe(1.6);
    expect(computeChargeCost(perKwh, { energyUsed: 10, energyAdded: null, durationMin: null })?.cost).toBe(1.6);
  });

  it("ajoute les frais de session", () => {
    const r = computeChargeCost(
      { billing_type: "per_kwh", cost_per_unit: 0.5, session_fee: 1 },
      { energyUsed: 20, energyAdded: null, durationMin: null },
    );
    expect(r?.cost).toBe(11);
  });

  it("per_minute : durée × tarif", () => {
    const r = computeChargeCost(
      { billing_type: "per_minute", cost_per_unit: 0.05, session_fee: null },
      { energyUsed: 20, energyAdded: 18, durationMin: 45 },
    );
    expect(r).toEqual({ cost: 2.25, quantity: 45 });
  });

  it("frais de session seuls (pas de tarif unitaire)", () => {
    const r = computeChargeCost(
      { billing_type: "per_kwh", cost_per_unit: null, session_fee: 3 },
      { energyUsed: 20, energyAdded: null, durationMin: null },
    );
    expect(r?.cost).toBe(3);
  });

  it("null sans tarif ni frais", () => {
    expect(
      computeChargeCost(
        { billing_type: "per_kwh", cost_per_unit: null, session_fee: null },
        { energyUsed: 20, energyAdded: 20, durationMin: 10 },
      ),
    ).toBeNull();
  });

  it("null sans quantité facturable", () => {
    expect(computeChargeCost(perKwh, { energyUsed: null, energyAdded: 0, durationMin: 10 })).toBeNull();
    expect(
      computeChargeCost(
        { billing_type: "per_minute", cost_per_unit: 0.05, session_fee: null },
        { energyUsed: 10, energyAdded: 10, durationMin: null },
      ),
    ).toBeNull();
  });

  it("arrondi à 2 décimales", () => {
    const r = computeChargeCost(
      { billing_type: "per_kwh", cost_per_unit: 0.1234, session_fee: null },
      { energyUsed: 7.77, energyAdded: null, durationMin: null },
    );
    expect(r?.cost).toBe(0.96);
  });
});
