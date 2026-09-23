/**
 * Calcul du coût d'une session de charge à partir du tarif de sa géofence,
 * selon la règle de TeslaMate (`complete_charging_process`) :
 *   - `per_kwh`    : cost_per_unit × max(énergie consommée, énergie ajoutée)
 *   - `per_minute` : cost_per_unit × durée (min)
 * auxquels s'ajoutent les frais de session (`session_fee`).
 *
 * Pur (pas de Prisma) → testable et utilisable côté client.
 */

export type BillingType = "per_kwh" | "per_minute";

export type GeofenceBilling = {
  billing_type: BillingType;
  cost_per_unit: number | null;
  session_fee: number | null;
};

export type ChargeCostInput = {
  energyUsed: number | null;
  energyAdded: number | null;
  durationMin: number | null;
};

export type ChargeCostResult = {
  cost: number;
  /** Quantité facturée : kWh (per_kwh) ou minutes (per_minute). */
  quantity: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function positive(n: number | null): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** `null` si la géofence n'a aucun tarif ou si la quantité facturée est inconnue. */
export function computeChargeCost(
  billing: GeofenceBilling,
  input: ChargeCostInput,
): ChargeCostResult | null {
  const unit = billing.cost_per_unit;
  const fee = billing.session_fee ?? 0;
  if (unit == null && billing.session_fee == null) return null;

  let quantity: number | null;
  if (billing.billing_type === "per_minute") {
    quantity = positive(input.durationMin);
  } else {
    const used = positive(input.energyUsed);
    const added = positive(input.energyAdded);
    quantity = used != null && added != null ? Math.max(used, added) : (used ?? added);
  }
  if (quantity == null) return null;

  return { cost: round2((unit ?? 0) * quantity + fee), quantity };
}
