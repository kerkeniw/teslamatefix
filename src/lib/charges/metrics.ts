/**
 * Indicateurs dérivés d'une session de charge, façon dashboard Grafana.
 * Fonctions pures (client + serveur).
 */

type EnergyFields = {
  charge_energy_added: number | null;
  charge_energy_used: number | null;
};

/** Seuil d'efficience sous lequel une session est mise en évidence (%). */
export const SUSPECT_EFFICIENCY_PCT = 70;
/** Énergie au-delà de laquelle une session est irréaliste (aucune batterie Tesla ne l'atteint). */
export const SUSPECT_ENERGY_KWH = 100;

/**
 * Efficience = énergie ajoutée / énergie consommée × 100. `null` si l'une des deux
 * manque ou si `used` ≤ 0 (Grafana affiche alors 100 % ; on préfère « inconnu »).
 */
export function chargeEfficiencyPct(row: EnergyFields): number | null {
  const { charge_energy_added: a, charge_energy_used: u } = row;
  if (a == null || u == null || !Number.isFinite(a) || !Number.isFinite(u) || u <= 0) {
    return null;
  }
  return (a / u) * 100;
}

/** Coût par kWh, rapporté au max(used, added) comme Grafana. */
export function costPerKwh(row: EnergyFields & { cost: number | null }): number | null {
  if (row.cost == null) return null;
  const kwh = Math.max(row.charge_energy_used ?? 0, row.charge_energy_added ?? 0);
  return kwh > 0 ? row.cost / kwh : null;
}

/** Puissance moyenne (kW) = énergie ajoutée × 60 / durée (min). */
export function avgPowerKw(row: {
  charge_energy_added: number | null;
  duration_min: number | null;
}): number | null {
  const { charge_energy_added: a, duration_min: d } = row;
  if (a == null || d == null || d <= 0) return null;
  return (a * 60) / d;
}

export function isSuspectEfficiency(effPct: number | null): boolean {
  return effPct != null && effPct < SUSPECT_EFFICIENCY_PCT;
}

export function isSuspectEnergy(kwh: number | null): boolean {
  return kwh != null && kwh > SUSPECT_ENERGY_KWH;
}
