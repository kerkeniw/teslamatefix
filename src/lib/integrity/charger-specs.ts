export type ChargerType = "AC" | "DC";

export const AC_POWERS_KW = [7, 11, 22] as const;
export const DC_POWERS_KW = [50, 150, 250, 350] as const;

/**
 * Puissances par défaut proposées dans les formulaires (création + édition).
 * - AC 7 kW : cas dominant de saisie utilisateur (recharges à domicile).
 * - DC 250 kW : palier Supercharger V3, le plus courant aujourd'hui.
 */
export const DEFAULT_POWER_KW = { AC: 7, DC: 250 } as const satisfies Record<
  ChargerType,
  number
>;

export type ChargerSpecs = {
  voltage: number | null;
  phases: number | null;
  current: number | null;
  pilot_current: number | null;
  fast_charger_present: boolean;
  conn_charge_cable: string;
  fast_charger_brand: string;
  fast_charger_type: string;
  battery_heater_on: boolean;
  battery_heater: boolean;
  warning: "acLimitedTo11kW" | null;
};

/**
 * Pré-remplissage indicatif pour les ticks à la création d'une session.
 * Valeurs calibrées sur les sessions observées du véhicule de référence :
 *
 * - AC chez Carrefour (52 sessions) → split-phase 240V/2ph/16A, conn=IEC,
 *   brand="<invalid>", type="<invalid>", heater off. pilot=actual.
 * - DC Supercharger (9 sessions) → power+fast_charger_present uniquement
 *   pour V/A/phases (TeslaMate rapporte 2V/0A en DC, non fiable). conn=IEC,
 *   brand="Tesla", type="Combo", heater off, pilot=16A constant.
 *
 * Les chaînes "<invalid>" sont des valeurs littérales conservées par
 * cohérence avec ce que TeslaMate stocke historiquement pour l'AC.
 *
 * L'UI peut surcharger toutes ces valeurs avant la sauvegarde.
 */
export function deriveChargerSpecs(
  type: ChargerType,
  powerKw: number,
): ChargerSpecs {
  if (type === "DC") {
    return {
      voltage: null,
      phases: null,
      current: null,
      pilot_current: 16,
      fast_charger_present: true,
      conn_charge_cable: "IEC",
      fast_charger_brand: "Tesla",
      fast_charger_type: "Combo",
      battery_heater_on: false,
      battery_heater: false,
      warning: null,
    };
  }
  const acCommon = {
    fast_charger_present: false,
    conn_charge_cable: "IEC",
    fast_charger_brand: "<invalid>",
    fast_charger_type: "<invalid>",
    battery_heater_on: false,
    battery_heater: false,
  };
  switch (powerKw) {
    case 7:
      return {
        ...acCommon,
        voltage: 240,
        phases: 1,
        current: 32,
        pilot_current: 32,
        warning: null,
      };
    case 11:
      return {
        ...acCommon,
        voltage: 240,
        phases: 2,
        current: 16,
        pilot_current: 16,
        warning: null,
      };
    case 22:
      return {
        ...acCommon,
        voltage: 240,
        phases: 2,
        current: 16,
        pilot_current: 16,
        warning: "acLimitedTo11kW",
      };
    default:
      return {
        ...acCommon,
        voltage: null,
        phases: null,
        current: null,
        pilot_current: null,
        warning: null,
      };
  }
}
