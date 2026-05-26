// Schémas Zod partagés pour l'édition / la création de charges.
// Isolé d'`actions.ts` (qui est "use server") pour pouvoir exporter des constantes
// non-fonctions (Next.js interdit l'export de valeurs autres qu'async dans un
// module "use server"). Utilisé directement par les Server Actions et par les
// tests unitaires (couverture de la coercion des champs borne notamment).

import { z } from "zod";

export const dateString = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v !== "", { message: "Date requise." })
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "Date invalide." });

export const optionalDate = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v == null || !Number.isNaN(new Date(v).getTime()), {
    message: "Date invalide.",
  });

export const optionalNumber = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v == null || Number.isFinite(Number(v)), {
    message: "invalidNumber",
  });

export const optionalNonNegative = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v == null || Number.isFinite(Number(v)), {
    message: "invalidNumber",
  })
  .refine((v) => v == null || Number(v) >= 0, {
    message: "negativeValue",
  });

export const optionalIntId = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine(
    (v) => {
      if (v == null) return true;
      const n = Number(v);
      return Number.isInteger(n) && n > 0;
    },
    { message: "invalidNumber" },
  );

export const carIdSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v !== "", { message: "carRequired" });

export const positionIdSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v !== "", { message: "positionRequired" })
  .refine(
    (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n > 0;
    },
    { message: "positionRequired" },
  );

export const optionalChargerType = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v == null || v === "AC" || v === "DC", {
    message: "invalidChargerType",
  });

/**
 * Champ entier d'un tick (charger_voltage, charger_phases, ...). Coercion
 * finale en `number` indispensable pour matcher les colonnes Prisma
 * `Int? @db.SmallInt` — sans elle, `parsed.data.charger_voltage` reste une
 * string et `tx.charges.update()` plante (PrismaClientValidationError).
 */
export const tickIntField = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine(
    (v) => {
      if (v == null) return true;
      const n = Number(v);
      return Number.isInteger(n);
    },
    { message: "invalidNumber" },
  )
  .transform((v) => (v == null ? null : Number(v)));

export const tickStringField = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable();

export const tickBoolField = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => v === "true");

export const applyAllField = z
  .string()
  .optional()
  .transform((v) => (v ?? "false").trim() === "true");

export const tickFieldSchemas = {
  charger_voltage: tickIntField,
  charger_phases: tickIntField,
  charger_actual_current: tickIntField,
  charger_pilot_current: tickIntField,
  charger_power: tickIntField,
  conn_charge_cable: tickStringField,
  fast_charger_brand: tickStringField,
  fast_charger_type: tickStringField,
  battery_heater_on: tickBoolField,
  battery_heater: tickBoolField,
} as const;

export const ChargeSchema = z
  .object({
    car_id: carIdSchema,
    position_id: positionIdSchema,
    start_date: dateString,
    end_date: optionalDate,
    charge_energy_added: optionalNonNegative,
    charge_energy_used: optionalNonNegative,
    cost: optionalNonNegative,
    start_battery_level: optionalNumber,
    end_battery_level: optionalNumber,
    start_ideal_range_km: optionalNumber,
    end_ideal_range_km: optionalNumber,
    start_rated_range_km: optionalNumber,
    end_rated_range_km: optionalNumber,
    address_id: optionalIntId,
    geofence_id: optionalIntId,
    outside_temp_avg: optionalNumber,
    outside_temp_avg_initial: optionalNumber.optional().default(null),
    outside_temp_avg_apply_all: applyAllField,
    charger_type: optionalChargerType.optional().default(null),
    charger_type_initial: optionalChargerType.optional().default(null),
    // Champs borne édités à granularité tick. Chaque champ est accompagné
    // d'un `<field>_initial` (valeur du dernier tick au chargement) pour
    // détecter le changement, et d'un `<field>_apply_all` qui détermine si
    // l'update vise tous les ticks (true) ou uniquement le dernier (false).
    charger_voltage: tickFieldSchemas.charger_voltage.optional().default(null),
    charger_voltage_initial: tickFieldSchemas.charger_voltage.optional().default(null),
    charger_voltage_apply_all: applyAllField,
    charger_phases: tickFieldSchemas.charger_phases.optional().default(null),
    charger_phases_initial: tickFieldSchemas.charger_phases.optional().default(null),
    charger_phases_apply_all: applyAllField,
    charger_actual_current: tickFieldSchemas.charger_actual_current.optional().default(null),
    charger_actual_current_initial: tickFieldSchemas.charger_actual_current.optional().default(null),
    charger_actual_current_apply_all: applyAllField,
    charger_pilot_current: tickFieldSchemas.charger_pilot_current.optional().default(null),
    charger_pilot_current_initial: tickFieldSchemas.charger_pilot_current.optional().default(null),
    charger_pilot_current_apply_all: applyAllField,
    charger_power: tickFieldSchemas.charger_power.optional().default(null),
    charger_power_initial: tickFieldSchemas.charger_power.optional().default(null),
    charger_power_apply_all: applyAllField,
    conn_charge_cable: tickFieldSchemas.conn_charge_cable.optional().default(null),
    conn_charge_cable_initial: tickFieldSchemas.conn_charge_cable.optional().default(null),
    conn_charge_cable_apply_all: applyAllField,
    fast_charger_brand: tickFieldSchemas.fast_charger_brand.optional().default(null),
    fast_charger_brand_initial: tickFieldSchemas.fast_charger_brand.optional().default(null),
    fast_charger_brand_apply_all: applyAllField,
    fast_charger_type: tickFieldSchemas.fast_charger_type.optional().default(null),
    fast_charger_type_initial: tickFieldSchemas.fast_charger_type.optional().default(null),
    fast_charger_type_apply_all: applyAllField,
    battery_heater_on: tickFieldSchemas.battery_heater_on.optional().default(false),
    battery_heater_on_initial: tickFieldSchemas.battery_heater_on.optional().default(false),
    battery_heater_on_apply_all: applyAllField,
    battery_heater: tickFieldSchemas.battery_heater.optional().default(false),
    battery_heater_initial: tickFieldSchemas.battery_heater.optional().default(false),
    battery_heater_apply_all: applyAllField,
  })
  .refine(
    (d) => {
      if (!d.end_date) return true;
      return new Date(d.end_date).getTime() >= new Date(d.start_date).getTime();
    },
    { path: ["end_date"], message: "endBeforeStart" },
  )
  .refine(
    (d) => {
      if (d.start_battery_level == null || d.end_battery_level == null) return true;
      return Number(d.end_battery_level) >= Number(d.start_battery_level);
    },
    { path: ["end_battery_level"], message: "endBatteryLowerThanStart" },
  );

export type ChargeSchemaInput = z.input<typeof ChargeSchema>;
export type ChargeSchemaOutput = z.output<typeof ChargeSchema>;
