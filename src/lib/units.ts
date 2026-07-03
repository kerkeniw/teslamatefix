/**
 * Conversions d'unités pour aligner l'affichage sur les préférences TeslaMate
 * (table `settings` : unit_of_length, unit_of_temperature). Le stockage en base
 * est toujours métrique (km, km/h, °C) ; on convertit uniquement pour l'affichage
 * et pour traduire les seuils de filtre saisis par l'utilisateur vers le métrique.
 */

export type LengthUnit = "km" | "mi";
export type TempUnit = "C" | "F";
export type PreferredRange = "ideal" | "rated";

// 1 km = 0.621371 mi
const KM_TO_MI = 0.621371;

export function kmToUnit(v: number, unit: LengthUnit): number {
  return unit === "mi" ? v * KM_TO_MI : v;
}

export function unitToKm(v: number, unit: LengthUnit): number {
  return unit === "mi" ? v / KM_TO_MI : v;
}

/** La vitesse suit l'unité de longueur (km/h ↔ mph). */
export function kmhToUnit(v: number, unit: LengthUnit): number {
  return kmToUnit(v, unit);
}

export function kmhFromUnit(v: number, unit: LengthUnit): number {
  return unitToKm(v, unit);
}

export function celsiusToUnit(v: number, unit: TempUnit): number {
  return unit === "F" ? v * 9 / 5 + 32 : v;
}

export function lengthLabel(unit: LengthUnit): string {
  return unit === "mi" ? "mi" : "km";
}

export function speedLabel(unit: LengthUnit): string {
  return unit === "mi" ? "mph" : "km/h";
}

export function tempLabel(unit: TempUnit): string {
  return unit === "F" ? "°F" : "°C";
}

/** Unité de consommation « par distance » (Wh/km ou Wh/mi). */
export function consumptionLabel(unit: LengthUnit): string {
  return unit === "mi" ? "Wh/mi" : "Wh/km";
}

export type UnitPrefs = {
  length: LengthUnit;
  temp: TempUnit;
  preferredRange: PreferredRange;
};
