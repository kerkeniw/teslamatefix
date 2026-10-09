/**
 * Colonnes scalaires de `positions` affichables dans le tableau des positions
 * d'un trajet. Module pur (client + serveur). `labelKey` = clé de
 * `positions.fields.*` ; `originSignature` = colonne que seul `vehicle_data`
 * remplit (vide sur une trame du flux), cf. docs/ORIGINE_POSITIONS.md.
 */
export const POSITION_SCALAR_COLUMNS = [
  { key: "speed", labelKey: "speed", kind: "int" },
  { key: "power", labelKey: "power", kind: "int" },
  { key: "odometer", labelKey: "odometer", kind: "km" },
  { key: "elevation", labelKey: "elevation", kind: "int" },
  { key: "battery_level", labelKey: "batteryLevel", kind: "percent" },
  { key: "usable_battery_level", labelKey: "usableBatteryLevel", kind: "percent", originSignature: true },
  { key: "ideal_battery_range_km", labelKey: "idealBatteryRangeKm", kind: "dec", originSignature: true },
  { key: "rated_battery_range_km", labelKey: "ratedBatteryRangeKm", kind: "dec", originSignature: true },
  { key: "est_battery_range_km", labelKey: "estBatteryRangeKm", kind: "dec", originSignature: true },
  { key: "outside_temp", labelKey: "outsideTemp", kind: "dec", originSignature: true },
  { key: "inside_temp", labelKey: "insideTemp", kind: "dec", originSignature: true },
  { key: "fan_status", labelKey: "fanStatus", kind: "int", originSignature: true },
  { key: "driver_temp_setting", labelKey: "driverTempSetting", kind: "dec", originSignature: true },
  { key: "passenger_temp_setting", labelKey: "passengerTempSetting", kind: "dec", originSignature: true },
  { key: "is_climate_on", labelKey: "isClimateOn", kind: "bool", originSignature: true },
  { key: "is_rear_defroster_on", labelKey: "isRearDefrosterOn", kind: "bool", originSignature: true },
  { key: "is_front_defroster_on", labelKey: "isFrontDefrosterOn", kind: "bool", originSignature: true },
  { key: "battery_heater", labelKey: "batteryHeater", kind: "bool", originSignature: true },
  { key: "battery_heater_on", labelKey: "batteryHeaterOn", kind: "bool", originSignature: true },
  { key: "battery_heater_no_power", labelKey: "batteryHeaterNoPower", kind: "bool", originSignature: true },
  { key: "tpms_pressure_fl", labelKey: "tpmsFl", kind: "dec", originSignature: true },
  { key: "tpms_pressure_fr", labelKey: "tpmsFr", kind: "dec", originSignature: true },
  { key: "tpms_pressure_rl", labelKey: "tpmsRl", kind: "dec", originSignature: true },
  { key: "tpms_pressure_rr", labelKey: "tpmsRr", kind: "dec", originSignature: true },
] as const satisfies readonly {
  key: string;
  labelKey: string;
  kind: "int" | "dec" | "km" | "percent" | "bool";
  originSignature?: boolean;
}[];

export type PositionScalarKey = (typeof POSITION_SCALAR_COLUMNS)[number]["key"];
export type PositionScalarColumn = (typeof POSITION_SCALAR_COLUMNS)[number];

/** Une colonne est « généralement remplie » au-delà de ce taux, sur le trajet. */
export const GENERALLY_FILLED_RATIO = 0.5;
