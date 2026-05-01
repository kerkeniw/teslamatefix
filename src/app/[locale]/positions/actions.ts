"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type PositionActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const dateString = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v !== "", { message: "invalidDate" })
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "invalidDate" });

const optionalNumber = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v == null || Number.isFinite(Number(v)), { message: "invalidNumber" });

const optionalIntId = z
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

const carIdSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v !== "", { message: "carRequired" });

const optionalBool = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => {
    if (v === "true") return true;
    if (v === "false") return false;
    return null;
  })
  .nullable();

const latSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => {
    if (v === "") return false;
    const n = Number(v);
    return Number.isFinite(n) && n >= -90 && n <= 90;
  }, { message: "invalidLat" });

const lonSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => {
    if (v === "") return false;
    const n = Number(v);
    return Number.isFinite(n) && n >= -180 && n <= 180;
  }, { message: "invalidLon" });

const PositionSchema = z.object({
  car_id: carIdSchema,
  drive_id: optionalIntId,
  date: dateString,
  latitude: latSchema,
  longitude: lonSchema,
  speed: optionalNumber,
  power: optionalNumber,
  odometer: optionalNumber,
  elevation: optionalNumber,
  outside_temp: optionalNumber,
  inside_temp: optionalNumber,
  battery_level: optionalNumber,
  usable_battery_level: optionalNumber,
  ideal_battery_range_km: optionalNumber,
  rated_battery_range_km: optionalNumber,
  est_battery_range_km: optionalNumber,
  fan_status: optionalNumber,
  driver_temp_setting: optionalNumber,
  passenger_temp_setting: optionalNumber,
  is_climate_on: optionalBool,
  is_rear_defroster_on: optionalBool,
  is_front_defroster_on: optionalBool,
  battery_heater: optionalBool,
  battery_heater_on: optionalBool,
  battery_heater_no_power: optionalBool,
  tpms_pressure_fl: optionalNumber,
  tpms_pressure_fr: optionalNumber,
  tpms_pressure_rl: optionalNumber,
  tpms_pressure_rr: optionalNumber,
});

function readOnly(): PositionActionState {
  return { ok: false, error: "Application en lecture seule." };
}

function feFromZod(err: z.ZodError): Record<string, string> {
  const fe: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path[0];
    if (typeof path === "string" && !fe[path]) fe[path] = issue.message;
  }
  return fe;
}

function decimal(v: string | null) {
  return v == null ? null : new Prisma.Decimal(v);
}
function intOrNull(v: string | null) {
  return v == null ? null : Math.trunc(Number(v));
}
function floatOrNull(v: string | null) {
  return v == null ? null : Number(v);
}

function toData(d: z.infer<typeof PositionSchema>): Prisma.positionsUncheckedCreateInput {
  return {
    car_id: parseInt(d.car_id, 10),
    drive_id: intOrNull(d.drive_id),
    date: new Date(d.date),
    latitude: new Prisma.Decimal(d.latitude),
    longitude: new Prisma.Decimal(d.longitude),
    speed: intOrNull(d.speed),
    power: intOrNull(d.power),
    odometer: floatOrNull(d.odometer),
    elevation: intOrNull(d.elevation),
    outside_temp: decimal(d.outside_temp),
    inside_temp: decimal(d.inside_temp),
    battery_level: intOrNull(d.battery_level),
    usable_battery_level: intOrNull(d.usable_battery_level),
    ideal_battery_range_km: decimal(d.ideal_battery_range_km),
    rated_battery_range_km: decimal(d.rated_battery_range_km),
    est_battery_range_km: decimal(d.est_battery_range_km),
    fan_status: intOrNull(d.fan_status),
    driver_temp_setting: decimal(d.driver_temp_setting),
    passenger_temp_setting: decimal(d.passenger_temp_setting),
    is_climate_on: d.is_climate_on,
    is_rear_defroster_on: d.is_rear_defroster_on,
    is_front_defroster_on: d.is_front_defroster_on,
    battery_heater: d.battery_heater,
    battery_heater_on: d.battery_heater_on,
    battery_heater_no_power: d.battery_heater_no_power,
    tpms_pressure_fl: decimal(d.tpms_pressure_fl),
    tpms_pressure_fr: decimal(d.tpms_pressure_fr),
    tpms_pressure_rl: decimal(d.tpms_pressure_rl),
    tpms_pressure_rr: decimal(d.tpms_pressure_rr),
  };
}

export async function createPositionAction(
  _prev: PositionActionState | null,
  formData: FormData,
): Promise<PositionActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnly();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = PositionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Données invalides.", fieldErrors: feFromZod(parsed.error) };
  }

  let createdId: number;
  try {
    const created = await prisma.positions.create({
      data: toData(parsed.data),
      select: { id: true },
    });
    createdId = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, error: "Référence introuvable (véhicule ou trajet)." };
    }
    logger.error({ event: "positions.create.error", err: String(e) }, "positions.create failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    { event: "positions.create", user: session.userId, id: createdId },
    "positions.create",
  );
  revalidatePath("/positions");
  redirect(`/positions/${createdId}`);
}

export async function updatePositionAction(
  id: number,
  _prev: PositionActionState | null,
  formData: FormData,
): Promise<PositionActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnly();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = PositionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Données invalides.", fieldErrors: feFromZod(parsed.error) };
  }

  try {
    await prisma.positions.update({ where: { id }, data: toData(parsed.data) });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return { ok: false, error: "Position introuvable." };
      if (e.code === "P2003") return { ok: false, error: "Référence introuvable." };
    }
    logger.error({ event: "positions.update.error", id, err: String(e) }, "positions.update failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    { event: "positions.update", user: session.userId, id, diff_keys: Object.keys(parsed.data) },
    "positions.update",
  );
  revalidatePath("/positions");
  revalidatePath(`/positions/${id}`);
  return { ok: true };
}

export async function deletePositionAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  // FK depuis charging_processes.position_id est NOT NULL ; on refuse la
  // suppression dans ce cas plutôt que de laisser Postgres lever une 23503.
  const usedByCharge = await prisma.charging_processes.count({ where: { position_id: id } });
  if (usedByCharge > 0) {
    return { ok: false, error: "Cette position est référencée par une charge — suppression refusée." };
  }

  try {
    // FK SET NULL côté drives.start/end_position_id : Postgres applique la
    // règle automatiquement à la suppression (cf. migration TeslaMate).
    await prisma.positions.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Position introuvable." };
    }
    logger.error({ event: "positions.delete.error", id, err: String(e) }, "positions.delete failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info({ event: "positions.delete", user: session.userId, id }, "positions.delete");
  revalidatePath("/positions");
  return { ok: true };
}

export async function bulkDeletePositionsAction(
  ids: number[],
): Promise<{ ok: boolean; error?: string; refused?: number[] }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Aucune position sélectionnée." };
  }
  const intIds = ids.filter((n) => Number.isInteger(n) && n > 0);
  if (intIds.length === 0) return { ok: false, error: "Identifiants invalides." };

  // Identifie les positions référencées par charging_processes (FK NOT NULL)
  // et exclut-les du delete pour éviter une 23503. Les drives utilisent SET NULL,
  // donc aucune exclusion à faire de ce côté.
  const refused = await prisma.charging_processes.findMany({
    where: { position_id: { in: intIds } },
    select: { position_id: true },
  });
  const refusedIds = new Set(refused.map((r) => r.position_id));
  const deletable = intIds.filter((i) => !refusedIds.has(i));

  if (deletable.length > 0) {
    try {
      await prisma.positions.deleteMany({ where: { id: { in: deletable } } });
    } catch (e) {
      logger.error(
        { event: "positions.bulk_delete.error", count: deletable.length, err: String(e) },
        "positions.bulk_delete failed",
      );
      return { ok: false, error: "Une erreur est survenue." };
    }
  }

  logger.info(
    {
      event: "positions.bulk_delete",
      user: session.userId,
      deleted: deletable.length,
      refused: [...refusedIds],
    },
    "positions.bulk_delete",
  );

  revalidatePath("/positions");
  return { ok: true, refused: [...refusedIds] };
}
