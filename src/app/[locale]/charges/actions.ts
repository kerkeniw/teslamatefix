"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  recalcFromTicks,
  applyRecalc as applyChargeRecalc,
  findOverlappingSession,
  validateDateBoundsAgainstTicks,
  propagateBoundDatesToTicks,
  CHARGER_TICK_FIELDS,
  type ChargerTickField,
  type ProcessRecalc,
} from "@/lib/integrity/charges";
import {
  AC_POWERS_KW,
  DC_POWERS_KW,
} from "@/lib/integrity/charger-specs";

export type ChargeActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

import {
  ChargeSchema,
  carIdSchema,
  dateString,
  optionalIntId,
  optionalNonNegative,
  positionIdSchema,
} from "./schema";

function readOnly(): ChargeActionState {
  return { ok: false, error: "Application en lecture seule." };
}

function feFromZod(err: z.ZodError): Record<string, string> {
  const fe: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path[0];
    if (typeof path === "string" && !fe[path]) {
      fe[path] = issue.message;
    }
  }
  return fe;
}

function decimal(v: string | null) {
  return v == null ? null : new Prisma.Decimal(v);
}
function intOrNull(v: string | null) {
  return v == null ? null : Math.trunc(Number(v));
}

function toData(d: z.infer<typeof ChargeSchema>) {
  const startDate = new Date(d.start_date);
  const endDate = d.end_date ? new Date(d.end_date) : null;
  // duration_min est toujours dérivée de (end - start). Le champ form est
  // ignoré côté serveur, l'UI l'affiche en lecture seule.
  const durationMin =
    endDate != null
      ? Math.round((endDate.getTime() - startDate.getTime()) / 60000)
      : null;
  return {
    car_id: parseInt(d.car_id, 10),
    position_id: parseInt(d.position_id, 10),
    start_date: startDate,
    end_date: endDate,
    duration_min: durationMin,
    charge_energy_added: decimal(d.charge_energy_added),
    charge_energy_used: decimal(d.charge_energy_used),
    cost: decimal(d.cost),
    start_battery_level: intOrNull(d.start_battery_level),
    end_battery_level: intOrNull(d.end_battery_level),
    start_ideal_range_km: decimal(d.start_ideal_range_km),
    end_ideal_range_km: decimal(d.end_ideal_range_km),
    start_rated_range_km: decimal(d.start_rated_range_km),
    end_rated_range_km: decimal(d.end_rated_range_km),
    address_id: intOrNull(d.address_id),
    geofence_id: intOrNull(d.geofence_id),
    outside_temp_avg: decimal(d.outside_temp_avg),
  } satisfies Prisma.charging_processesUncheckedCreateInput;
}

const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

function isStartInFuture(startDate: Date): boolean {
  return startDate.getTime() > Date.now() + CLOCK_TOLERANCE_MS;
}

export async function createChargeAction(
  _prev: ChargeActionState | null,
  formData: FormData,
): Promise<ChargeActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnly();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = ChargeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Données invalides.", fieldErrors: feFromZod(parsed.error) };
  }

  const data = toData(parsed.data);

  if (isStartInFuture(data.start_date)) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: { start_date: "startDateInFuture" },
    };
  }

  const overlap = await findOverlappingSession(
    data.car_id,
    data.start_date,
    data.end_date,
    null,
  );
  if (overlap) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: { start_date: "overlapsSession", end_date: "overlapsSession" },
    };
  }

  let createdId: number;
  try {
    const created = await prisma.charging_processes.create({
      data,
      select: { id: true },
    });
    createdId = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, error: "Référence introuvable (véhicule, position, adresse ou géofence)." };
    }
    logger.error({ event: "charges.create.error", err: String(e) }, "charges.create failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    { event: "charges.create", user: session.userId, id: createdId, car_id: parsed.data.car_id },
    "charges.create",
  );

  revalidatePath("/charges");
  redirect(`/charges/${createdId}`);
}

export async function updateChargeAction(
  id: number,
  _prev: ChargeActionState | null,
  formData: FormData,
): Promise<ChargeActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnly();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = ChargeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Données invalides.", fieldErrors: feFromZod(parsed.error) };
  }

  const data = toData(parsed.data);

  const overlap = await findOverlappingSession(
    data.car_id,
    data.start_date,
    data.end_date,
    id,
  );
  if (overlap) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: { start_date: "overlapsSession", end_date: "overlapsSession" },
    };
  }

  // Garde-fou métier : les ticks intermédiaires (second .. avant-dernier)
  // doivent rester dans l'intervalle [start_date, end_date]. Si la session a
  // moins de 2 ticks, no-op (premier et dernier tick suffisent à les autoriser).
  const boundErrors = await validateDateBoundsAgainstTicks(id, data.start_date, data.end_date);
  if (Object.keys(boundErrors).length > 0) {
    return { ok: false, error: "Données invalides.", fieldErrors: boundErrors };
  }

  const chargerType = parsed.data.charger_type;
  const chargerTypeInitial = parsed.data.charger_type_initial;
  const chargerTypeChanged =
    chargerType != null && chargerType !== chargerTypeInitial;

  // Calcule la liste des updates borne à appliquer. `_initial` est la valeur
  // du dernier tick au chargement (cf. ChargerTickField.tsx). Skip uniquement
  // si la valeur n'a pas changé ET que la case "Appliquer à tous les ticks"
  // n'est pas cochée — sinon (case cochée + valeur inchangée), on veut
  // propager la valeur courante aux autres ticks même si le formulaire ne
  // l'a pas modifiée par rapport au dernier tick.
  type ChargerTickUpdate = {
    field: ChargerTickField;
    value: number | string | boolean | null;
    applyAll: boolean;
  };
  const tickUpdates: ChargerTickUpdate[] = [];
  for (const field of CHARGER_TICK_FIELDS) {
    const value = (parsed.data as Record<string, unknown>)[field] as
      | number
      | string
      | boolean
      | null;
    const initial = (parsed.data as Record<string, unknown>)[`${field}_initial`] as
      | number
      | string
      | boolean
      | null;
    const applyAll =
      (parsed.data as Record<string, unknown>)[`${field}_apply_all`] === true;
    if (value === initial && !applyAll) continue;
    tickUpdates.push({ field, value, applyAll });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.charging_processes.update({ where: { id }, data });

      if (chargerTypeChanged) {
        const isDC = chargerType === "DC";
        await tx.charges.updateMany({
          where: { charging_process_id: id },
          data: {
            fast_charger_present: isDC,
            // Cohérent avec deriveChargerSpecs : DC = Tesla/Combo, AC = "<invalid>".
            fast_charger_brand: isDC ? "Tesla" : "<invalid>",
            fast_charger_type: isDC ? "Combo" : "<invalid>",
            conn_charge_cable: "IEC",
          },
        });
      }

      if (tickUpdates.length > 0) {
        // Règle métier : si la session a > 2 ticks, la communication véhicule
        // a fonctionné et les ticks intermédiaires sont fiables — seul le
        // dernier tick est corrigible (apply_all forcé à false côté serveur,
        // défense en profondeur même si l'UI verrouille déjà la case).
        // Si la session a exactement 2 ticks (départ + fin), apply_all
        // déclenche deux `update` explicites (firstTick + lastTick) — plus
        // sûr qu'un `updateMany` global et facilite le diagnostic.
        const tickIds = await tx.charges.findMany({
          where: { charging_process_id: id },
          orderBy: { date: "asc" },
          select: { id: true },
        });
        const firstTickId = tickIds[0]?.id;
        const lastTickId = tickIds[tickIds.length - 1]?.id;
        const tickCount = tickIds.length;

        for (const u of tickUpdates) {
          const updateData = { [u.field]: u.value } as Prisma.chargesUpdateManyMutationInput;
          const applyAll = u.applyAll && tickCount === 2;
          if (applyAll && firstTickId != null && lastTickId != null) {
            await tx.charges.update({
              where: { id: firstTickId },
              data: updateData,
            });
            await tx.charges.update({
              where: { id: lastTickId },
              data: updateData,
            });
          } else if (lastTickId != null) {
            await tx.charges.update({
              where: { id: lastTickId },
              data: updateData,
            });
          }
        }
      }

      // outside_temp_avg : si la valeur change OU que apply_all est cochée,
      // on propage la valeur courante sur les ticks. Même règle métier que
      // pour les champs charger : apply_all est ignoré si la session a > 2
      // ticks (les intermédiaires sont fiables, on ne touche qu'au dernier).
      {
        const v = parsed.data.outside_temp_avg;
        const initial = parsed.data.outside_temp_avg_initial;
        const applyAllRaw = parsed.data.outside_temp_avg_apply_all === true;
        const changed = v !== initial;
        if (changed || applyAllRaw) {
          const tickIds = await tx.charges.findMany({
            where: { charging_process_id: id },
            orderBy: { date: "asc" },
            select: { id: true },
          });
          const tickCount = tickIds.length;
          const firstTickId = tickIds[0]?.id;
          const lastTickId = tickIds[tickIds.length - 1]?.id;
          const applyAll = applyAllRaw && tickCount === 2;
          const value = v == null ? null : new Prisma.Decimal(v);
          const updateData = { outside_temp: value };
          if (applyAll && firstTickId != null && lastTickId != null) {
            await tx.charges.update({ where: { id: firstTickId }, data: updateData });
            await tx.charges.update({ where: { id: lastTickId }, data: updateData });
          } else if (changed && lastTickId != null) {
            await tx.charges.update({ where: { id: lastTickId }, data: updateData });
          }
        }
      }

      // Propagation des bornes start_date / end_date aux ticks. En cas de
      // mono-tick, le helper crée un second tick pour maintenir l'invariant
      // ≥ 2 ticks.
      await propagateBoundDatesToTicks(tx, id, data.start_date, data.end_date, {
        end_battery_level: data.end_battery_level ?? undefined,
        end_charge_energy_added: data.charge_energy_added ?? undefined,
        end_ideal_battery_range_km: data.end_ideal_range_km ?? undefined,
        end_rated_battery_range_km: data.end_rated_range_km ?? undefined,
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return { ok: false, error: "Session de charge introuvable." };
      if (e.code === "P2003") return { ok: false, error: "Référence introuvable." };
    }
    logger.error({ event: "charges.update.error", id, err: String(e) }, "charges.update failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "charges.update",
      user: session.userId,
      id,
      diff_keys: Object.keys(parsed.data),
      charger_type_changed: chargerTypeChanged ? { from: chargerTypeInitial, to: chargerType } : null,
    },
    "charges.update",
  );

  revalidatePath("/charges");
  revalidatePath(`/charges/${id}`);
  return { ok: true };
}

export async function deleteChargeAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  try {
    // CASCADE côté DB sur charges.charging_process_id : tous les ticks tombent
    // automatiquement avec la session.
    await prisma.charging_processes.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Session de charge introuvable." };
    }
    logger.error({ event: "charges.delete.error", id, err: String(e) }, "charges.delete failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info({ event: "charges.delete", user: session.userId, id }, "charges.delete");
  revalidatePath("/charges");
  return { ok: true };
}

export async function deleteTickAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  let processId: number | null = null;
  try {
    const tick = await prisma.charges.findUnique({
      where: { id },
      select: { charging_process_id: true },
    });
    processId = tick?.charging_process_id ?? null;
    await prisma.charges.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Mesure introuvable." };
    }
    logger.error({ event: "charges.tick.delete.error", id, err: String(e) }, "tick delete failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info({ event: "charges.tick.delete", user: session.userId, id, process_id: processId }, "tick delete");
  if (processId != null) revalidatePath(`/charges/${processId}`);
  return { ok: true };
}

function serializeRecalc(r: ProcessRecalc) {
  return {
    start_date: r.start_date ? r.start_date.toISOString() : null,
    end_date: r.end_date ? r.end_date.toISOString() : null,
    duration_min: r.duration_min,
    charge_energy_added: r.charge_energy_added,
    start_battery_level: r.start_battery_level,
    end_battery_level: r.end_battery_level,
  };
}

export type SerializedChargeRecalc = ReturnType<typeof serializeRecalc>;

export async function recalcChargeAction(processId: number): Promise<{
  ok: boolean;
  error?: string;
  before?: SerializedChargeRecalc;
  after?: SerializedChargeRecalc;
}> {
  await requireSession();
  try {
    const r = await recalcFromTicks(processId);
    return { ok: true, before: serializeRecalc(r.before), after: serializeRecalc(r.after) };
  } catch (e) {
    logger.error(
      { event: "charges.recalc.error", id: processId, err: String(e) },
      "charges.recalc failed",
    );
    return { ok: false, error: "Recalcul impossible." };
  }
}

export async function applyRecalcChargeAction(
  processId: number,
  after: SerializedChargeRecalc,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  try {
    await applyChargeRecalc(processId, {
      start_date: after.start_date ? new Date(after.start_date) : null,
      end_date: after.end_date ? new Date(after.end_date) : null,
      duration_min: after.duration_min,
      charge_energy_added: after.charge_energy_added,
      start_battery_level: after.start_battery_level,
      end_battery_level: after.end_battery_level,
    });
  } catch (e) {
    logger.error(
      { event: "charges.recalc.apply.error", id: processId, err: String(e) },
      "charges.recalc.apply failed",
    );
    return { ok: false, error: "Échec de l'application du recalcul." };
  }

  logger.info(
    { event: "charges.recalc.apply", user: session.userId, id: processId },
    "charges.recalc.apply",
  );
  revalidatePath(`/charges/${processId}`);
  return { ok: true };
}

// =====================================================================
// createChargeWithTicksAction — wizard de création métier
// =====================================================================
//
// Le wizard envoie en plus du form de session classique :
// - charger_type, charger_power_kw  (saisie utilisateur étape 1)
// - charger_voltage, charger_phases, charger_actual_current, charger_power,
//   fast_charger_present (pré-remplis étape 2, éditables)
// - position_before_id, position_before_initial_<f>, position_before_<f>
// - position_after_id (optionnel) + initial_<f> + <f>
//
// L'action :
// 1) valide ; 2) check overlap ; 3) pour chaque position soumise, compare
//    snapshot initial vs valeurs soumises — si différent insère une nouvelle
//    positions ; 4) crée charging_processes + 2 ticks dans une transaction.

const EDITABLE_POSITION_FIELDS = [
  "latitude",
  "longitude",
  "odometer",
  "outside_temp",
  "inside_temp",
  "battery_level",
  "usable_battery_level",
  "ideal_battery_range_km",
  "rated_battery_range_km",
] as const;
type EditablePositionField = (typeof EDITABLE_POSITION_FIELDS)[number];

type PositionEdit = {
  id: number;
  values: Record<EditablePositionField, string>;
  initial: Record<EditablePositionField, string>;
};

function readPositionEdit(
  raw: Record<string, string>,
  prefix: string,
): PositionEdit | null {
  const idRaw = raw[`${prefix}_id`];
  if (!idRaw || !/^\d+$/.test(idRaw)) return null;
  const values = {} as Record<EditablePositionField, string>;
  const initial = {} as Record<EditablePositionField, string>;
  for (const f of EDITABLE_POSITION_FIELDS) {
    values[f] = raw[`${prefix}_${f}`] ?? "";
    initial[f] = raw[`${prefix}_initial_${f}`] ?? "";
  }
  return { id: Number(idRaw), values, initial };
}

function positionWasEdited(edit: PositionEdit): boolean {
  for (const f of EDITABLE_POSITION_FIELDS) {
    if (edit.values[f].trim() !== edit.initial[f].trim()) return true;
  }
  return false;
}

async function insertModifiedPosition(
  tx: Prisma.TransactionClient,
  originalId: number,
  edit: PositionEdit,
): Promise<number> {
  const original = await tx.positions.findUnique({ where: { id: originalId } });
  if (!original) {
    throw new Error(`Position d'origine ${originalId} introuvable.`);
  }

  const decOrNull = (s: string) =>
    s.trim() === "" ? null : new Prisma.Decimal(s);
  const intOrNullLocal = (s: string) =>
    s.trim() === "" ? null : Math.trunc(Number(s));
  const floatOrNull = (s: string) =>
    s.trim() === "" ? null : Number(s);

  const latitude = decOrNull(edit.values.latitude);
  const longitude = decOrNull(edit.values.longitude);
  if (latitude == null || longitude == null) {
    throw new Error("Latitude/longitude requises pour la position.");
  }

  // On clone l'original puis on surcharge avec les valeurs éditées.
  // `id` est supprimé pour laisser autoincrement. La date d'origine est
  // conservée car elle représente l'instant GPS, pas l'instant de la session.
  const { id: _ignored, ...rest } = original;
  const data: Prisma.positionsUncheckedCreateInput = {
    ...rest,
    latitude,
    longitude,
    odometer: floatOrNull(edit.values.odometer),
    outside_temp: decOrNull(edit.values.outside_temp),
    inside_temp: decOrNull(edit.values.inside_temp),
    battery_level: intOrNullLocal(edit.values.battery_level),
    usable_battery_level: intOrNullLocal(edit.values.usable_battery_level),
    ideal_battery_range_km: decOrNull(edit.values.ideal_battery_range_km),
    rated_battery_range_km: decOrNull(edit.values.rated_battery_range_km),
    // Une position créée hors d'un drive n'appartient pas à un drive.
    drive_id: null,
  };
  const created = await tx.positions.create({ data, select: { id: true } });
  return created.id;
}

type ResolvedPosition = { id: number; date: Date };

async function resolvePosition(
  tx: Prisma.TransactionClient,
  edit: PositionEdit,
): Promise<ResolvedPosition> {
  let useId = edit.id;
  if (positionWasEdited(edit)) {
    useId = await insertModifiedPosition(tx, edit.id, edit);
  }
  const row = await tx.positions.findUnique({
    where: { id: useId },
    select: { id: true, date: true },
  });
  if (!row) {
    throw new Error(`Position ${useId} introuvable après résolution.`);
  }
  return row;
}

/**
 * Valeurs typées d'une position lues depuis le FORM (pas depuis la DB).
 * Source de vérité pour les ticks et `charging_processes.start_*` /
 * `end_*` : ce que l'utilisateur a vu et validé à l'écran, avec
 * éventuels fallbacks d'enrichissement déjà appliqués côté Step2.
 */
type PositionFormValues = {
  battery_level: number | null;
  usable_battery_level: number | null;
  outside_temp: Prisma.Decimal | null;
  inside_temp: Prisma.Decimal | null;
  ideal_battery_range_km: Prisma.Decimal | null;
  rated_battery_range_km: Prisma.Decimal | null;
};

function readPositionForm(
  raw: Record<string, string>,
  prefix: string,
): PositionFormValues {
  const intF = (s: string) =>
    s.trim() === "" ? null : Math.trunc(Number(s));
  const decF = (s: string) =>
    s.trim() === "" ? null : new Prisma.Decimal(s);
  return {
    battery_level: intF(raw[`${prefix}_battery_level`] ?? ""),
    usable_battery_level: intF(raw[`${prefix}_usable_battery_level`] ?? ""),
    outside_temp: decF(raw[`${prefix}_outside_temp`] ?? ""),
    inside_temp: decF(raw[`${prefix}_inside_temp`] ?? ""),
    ideal_battery_range_km: decF(raw[`${prefix}_ideal_battery_range_km`] ?? ""),
    rated_battery_range_km: decF(raw[`${prefix}_rated_battery_range_km`] ?? ""),
  };
}

function resolveIdealRangeForTick(p: PositionFormValues): Prisma.Decimal {
  if (p.ideal_battery_range_km != null) return p.ideal_battery_range_km;
  if (p.rated_battery_range_km != null) return p.rated_battery_range_km;
  return new Prisma.Decimal(0);
}

function pickStartSoc(p: PositionFormValues): number | null {
  return p.usable_battery_level ?? p.battery_level ?? null;
}

const chargerTypeSchema = z.enum(["AC", "DC"]);
const chargerPowerKwSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => /^\d+$/.test(v), { message: "invalidNumber" })
  .transform((v) => Number(v));

const optionalSmallInt = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine(
    (v) => {
      if (v == null) return true;
      const n = Number(v);
      return Number.isFinite(n);
    },
    { message: "invalidNumber" },
  );

const positiveIntField = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => /^\d+$/.test(v), { message: "invalidNumber" })
  .transform((v) => Number(v));

const optionalString = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable();

const boolString = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => v === "true");

const CreateWithTicksSchema = z
  .object({
    car_id: carIdSchema,
    start_date: dateString,
    end_date: dateString,
    charge_energy_added: optionalNonNegative,
    charge_energy_used: optionalNonNegative,
    cost: optionalNonNegative,
    charger_type: chargerTypeSchema,
    charger_power_kw: chargerPowerKwSchema,
    charger_voltage: optionalSmallInt,
    charger_phases: optionalSmallInt,
    charger_actual_current: optionalSmallInt,
    charger_pilot_current: optionalSmallInt,
    charger_power: positiveIntField,
    fast_charger_present: z.enum(["true", "false"]).transform((v) => v === "true"),
    conn_charge_cable: optionalString,
    fast_charger_brand: optionalString,
    fast_charger_type: optionalString,
    battery_heater_on: boolString,
    battery_heater: boolString,
    address_id: optionalIntId,
    geofence_id: optionalIntId,
    position_before_id: positionIdSchema,
    // position_after_id est lu hors Zod (présent si non vide).
  })
  .refine(
    (d) => new Date(d.end_date).getTime() >= new Date(d.start_date).getTime(),
    { path: ["end_date"], message: "endBeforeStart" },
  )
  .refine(
    (d) => {
      if (d.charger_type === "AC") {
        return AC_POWERS_KW.includes(
          d.charger_power_kw as (typeof AC_POWERS_KW)[number],
        );
      }
      return DC_POWERS_KW.includes(
        d.charger_power_kw as (typeof DC_POWERS_KW)[number],
      );
    },
    { path: ["charger_power_kw"], message: "invalidChargerPower" },
  );

/**
 * Normalise une chaîne décimale envoyée par le navigateur : supprime espaces,
 * accepte virgule OU point comme séparateur décimal. Aucun arrondi, aucun
 * troncage — uniquement remplacement de séparateur. Évite les surprises
 * locales fr-FR sur `<input type="number" step="0.01">`.
 */
function normalizeDecimalString(v: string | undefined): string {
  if (v == null) return "";
  return v.replace(/\s+/g, "").replace(",", ".");
}

export async function createChargeWithTicksAction(
  _prev: ChargeActionState | null,
  formData: FormData,
): Promise<ChargeActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnly();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;

  // Itération 4 — trace les valeurs brutes reçues avant validation. Permet
  // de diagnostiquer toute divergence saisie utilisateur ↔ valeur stockée.
  const costRaw = raw.cost ?? "";
  const energyAddedRaw = raw.charge_energy_added ?? "";
  const energyUsedRaw = raw.charge_energy_used ?? "";
  raw.cost = normalizeDecimalString(costRaw);
  raw.charge_energy_added = normalizeDecimalString(energyAddedRaw);
  raw.charge_energy_used = normalizeDecimalString(energyUsedRaw);

  logger.info(
    {
      event: "charges.createWithTicks.received",
      cost_raw: costRaw,
      cost_normalized: raw.cost,
      energy_added_raw: energyAddedRaw,
      energy_added_normalized: raw.charge_energy_added,
      energy_used_raw: energyUsedRaw,
      energy_used_normalized: raw.charge_energy_used,
    },
    "charges.createWithTicks.received",
  );

  const parsed = CreateWithTicksSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: feFromZod(parsed.error),
    };
  }
  const d = parsed.data;

  const carId = parseInt(d.car_id, 10);
  const startDate = new Date(d.start_date);
  const endDate = new Date(d.end_date);

  if (isStartInFuture(startDate)) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: { start_date: "startDateInFuture" },
    };
  }

  const overlap = await findOverlappingSession(carId, startDate, endDate, null);
  if (overlap) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: { start_date: "overlapsSession", end_date: "overlapsSession" },
    };
  }

  const editBefore = readPositionEdit(raw, "position_before");
  if (!editBefore) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: { position_before_id: "positionRequired" },
    };
  }
  const editAfter = readPositionEdit(raw, "position_after");

  const energyAdded = d.charge_energy_added == null ? 0 : Number(d.charge_energy_added);

  // Source de vérité pour les valeurs batterie/temp/range : le FORM (ce que
  // l'utilisateur a vu et validé après enrichissement Step2 + modifs).
  const beforeFormValues = readPositionForm(raw, "position_before");
  const afterFormValues = editAfter
    ? readPositionForm(raw, "position_after")
    : beforeFormValues;

  let createdProcessId: number;
  try {
    createdProcessId = await prisma.$transaction(async (tx) => {
      const startPos = await resolvePosition(tx, editBefore);
      const endPos = editAfter ? await resolvePosition(tx, editAfter) : startPos;

      const durationMin = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

      const outsideTempAvg = (() => {
        const a =
          beforeFormValues.outside_temp == null
            ? null
            : Number(beforeFormValues.outside_temp);
        const b =
          afterFormValues.outside_temp == null
            ? null
            : Number(afterFormValues.outside_temp);
        if (a == null && b == null) return null;
        if (a == null) return new Prisma.Decimal(b!);
        if (b == null) return new Prisma.Decimal(a);
        return new Prisma.Decimal((a + b) / 2);
      })();

      const startSoc = pickStartSoc(beforeFormValues);
      const endSoc = pickStartSoc(afterFormValues);

      const proc = await tx.charging_processes.create({
        data: {
          car_id: carId,
          position_id: startPos.id,
          start_date: startDate,
          end_date: endDate,
          duration_min: durationMin,
          charge_energy_added: decimal(d.charge_energy_added),
          charge_energy_used: decimal(d.charge_energy_used),
          cost: decimal(d.cost),
          start_battery_level: startSoc,
          end_battery_level: endSoc,
          start_ideal_range_km: beforeFormValues.ideal_battery_range_km,
          end_ideal_range_km: afterFormValues.ideal_battery_range_km,
          start_rated_range_km: beforeFormValues.rated_battery_range_km,
          end_rated_range_km: afterFormValues.rated_battery_range_km,
          address_id: intOrNull(d.address_id),
          geofence_id: intOrNull(d.geofence_id),
          outside_temp_avg: outsideTempAvg,
        },
        select: { id: true },
      });

      // Configuration borne stable sur la session ; éditée par l'utilisateur
      // au Step2 (V/phases/A/pilot/power/fast + détails câble/marque/type
      // + chauffage batterie). On l'applique aux 2 ticks.
      const chargerCommon = {
        charger_voltage: intOrNull(d.charger_voltage),
        charger_phases: intOrNull(d.charger_phases),
        charger_actual_current: intOrNull(d.charger_actual_current),
        charger_pilot_current: intOrNull(d.charger_pilot_current),
        charger_power: d.charger_power,
        fast_charger_present: d.fast_charger_present,
        conn_charge_cable: d.conn_charge_cable,
        fast_charger_brand: d.fast_charger_brand,
        fast_charger_type: d.fast_charger_type,
        battery_heater_on: d.battery_heater_on,
        battery_heater: d.battery_heater,
      };

      await tx.charges.createMany({
        data: [
          {
            charging_process_id: proc.id,
            date: startDate,
            battery_level: beforeFormValues.battery_level,
            usable_battery_level: beforeFormValues.usable_battery_level,
            ideal_battery_range_km: resolveIdealRangeForTick(beforeFormValues),
            rated_battery_range_km: beforeFormValues.rated_battery_range_km,
            outside_temp: beforeFormValues.outside_temp,
            charge_energy_added: new Prisma.Decimal(0),
            ...chargerCommon,
          },
          {
            charging_process_id: proc.id,
            date: endDate,
            battery_level: afterFormValues.battery_level,
            usable_battery_level: afterFormValues.usable_battery_level,
            ideal_battery_range_km: resolveIdealRangeForTick(afterFormValues),
            rated_battery_range_km: afterFormValues.rated_battery_range_km,
            outside_temp: afterFormValues.outside_temp,
            charge_energy_added: new Prisma.Decimal(energyAdded),
            ...chargerCommon,
          },
        ],
      });

      // endPos est résolu (utilisé pour potentielle insertion de nouvelle
      // position) mais ses valeurs ne sont pas relues : tout vient du form.
      void endPos;

      return proc.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return {
        ok: false,
        error: "Référence introuvable (véhicule, position, adresse ou géofence).",
      };
    }
    logger.error(
      { event: "charges.createWithTicks.error", err: String(e) },
      "charges.createWithTicks failed",
    );
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "charges.createWithTicks",
      user: session.userId,
      id: createdProcessId,
      car_id: carId,
      cost: d.cost,
      charge_energy_added: d.charge_energy_added,
      charge_energy_used: d.charge_energy_used,
    },
    "charges.createWithTicks",
  );

  revalidatePath("/charges");
  redirect(`/charges/${createdProcessId}`);
}
