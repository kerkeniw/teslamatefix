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
  recalcFromPositions,
  applyRecalc as applyDriveRecalc,
  type DriveRecalc,
} from "@/lib/integrity/drives";

export type DriveActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const dateString = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v !== "", { message: "Date requise." })
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "Date invalide." });

const optionalDate = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v == null || !Number.isNaN(new Date(v).getTime()), {
    message: "Date invalide.",
  });

const optionalNumber = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v == null || Number.isFinite(Number(v)), {
    message: "invalidNumber",
  });

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
  .refine((v) => v !== "", { message: "carRequired" })
  .refine(
    (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 32767;
    },
    { message: "carRequired" },
  );

const DriveSchema = z
  .object({
    car_id: carIdSchema,
    start_date: dateString,
    end_date: optionalDate,
    start_km: optionalNumber,
    end_km: optionalNumber,
    distance: optionalNumber,
    duration_min: optionalNumber,
    start_address_id: optionalIntId,
    end_address_id: optionalIntId,
    start_geofence_id: optionalIntId,
    end_geofence_id: optionalIntId,
    start_ideal_range_km: optionalNumber,
    end_ideal_range_km: optionalNumber,
    start_rated_range_km: optionalNumber,
    end_rated_range_km: optionalNumber,
    outside_temp_avg: optionalNumber,
    inside_temp_avg: optionalNumber,
    speed_max: optionalNumber,
    power_min: optionalNumber,
    power_max: optionalNumber,
    ascent: optionalNumber,
    descent: optionalNumber,
  })
  .refine(
    (d) => {
      if (!d.end_date) return true;
      return new Date(d.end_date).getTime() >= new Date(d.start_date).getTime();
    },
    { path: ["end_date"], message: "endBeforeStart" },
  );

function readOnly(): DriveActionState {
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
function floatOrNull(v: string | null) {
  return v == null ? null : Number(v);
}

function toDriveData(d: z.infer<typeof DriveSchema>): Prisma.drivesUncheckedCreateInput {
  return {
    car_id: parseInt(d.car_id, 10),
    start_date: new Date(d.start_date),
    end_date: d.end_date ? new Date(d.end_date) : null,
    start_km: floatOrNull(d.start_km),
    end_km: floatOrNull(d.end_km),
    distance: floatOrNull(d.distance),
    duration_min: intOrNull(d.duration_min),
    start_address_id: intOrNull(d.start_address_id),
    end_address_id: intOrNull(d.end_address_id),
    start_geofence_id: intOrNull(d.start_geofence_id),
    end_geofence_id: intOrNull(d.end_geofence_id),
    start_ideal_range_km: decimal(d.start_ideal_range_km),
    end_ideal_range_km: decimal(d.end_ideal_range_km),
    start_rated_range_km: decimal(d.start_rated_range_km),
    end_rated_range_km: decimal(d.end_rated_range_km),
    outside_temp_avg: decimal(d.outside_temp_avg),
    inside_temp_avg: decimal(d.inside_temp_avg),
    speed_max: intOrNull(d.speed_max),
    power_min: intOrNull(d.power_min),
    power_max: intOrNull(d.power_max),
    ascent: intOrNull(d.ascent),
    descent: intOrNull(d.descent),
  };
}

export async function createDriveAction(
  _prev: DriveActionState | null,
  formData: FormData,
): Promise<DriveActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnly();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = DriveSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Données invalides.", fieldErrors: feFromZod(parsed.error) };
  }

  let createdId: number;
  try {
    const created = await prisma.drives.create({
      data: toDriveData(parsed.data),
      select: { id: true },
    });
    createdId = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, error: "Référence introuvable (véhicule, adresse ou géofence)." };
    }
    logger.error({ event: "drives.create.error", err: String(e) }, "drives.create failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    { event: "drives.create", user: session.userId, id: createdId, car_id: parsed.data.car_id },
    "drives.create",
  );

  revalidatePath("/drives");
  redirect(`/drives/${createdId}`);
}

export async function updateDriveAction(
  id: number,
  _prev: DriveActionState | null,
  formData: FormData,
): Promise<DriveActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnly();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = DriveSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Données invalides.", fieldErrors: feFromZod(parsed.error) };
  }

  try {
    await prisma.drives.update({
      where: { id },
      data: toDriveData(parsed.data),
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return { ok: false, error: "Trajet introuvable." };
      if (e.code === "P2003") {
        return { ok: false, error: "Référence introuvable (adresse ou géofence)." };
      }
    }
    logger.error({ event: "drives.update.error", id, err: String(e) }, "drives.update failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    { event: "drives.update", user: session.userId, id, diff_keys: Object.keys(parsed.data) },
    "drives.update",
  );

  revalidatePath("/drives");
  revalidatePath(`/drives/${id}`);
  return { ok: true };
}

export async function deleteDriveAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  try {
    // FK SET NULL côté positions.drive_id géré côté DB ; on fait un update préventif
    // ici uniquement si Prisma ne traduit pas correctement la contrainte ON DELETE.
    // TeslaMate gère déjà la cascade via la migration Ecto, donc delete suffit.
    await prisma.drives.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Trajet introuvable." };
    }
    logger.error({ event: "drives.delete.error", id, err: String(e) }, "drives.delete failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info({ event: "drives.delete", user: session.userId, id }, "drives.delete");
  revalidatePath("/drives");
  return { ok: true };
}

function serializeRecalc(r: DriveRecalc) {
  return {
    start_date: r.start_date ? r.start_date.toISOString() : null,
    end_date: r.end_date ? r.end_date.toISOString() : null,
    distance: r.distance,
    duration_min: r.duration_min,
    ascent: r.ascent,
    descent: r.descent,
    speed_max: r.speed_max,
  };
}

export type SerializedRecalc = ReturnType<typeof serializeRecalc>;

export async function recalcDriveAction(driveId: number): Promise<{
  ok: boolean;
  error?: string;
  before?: SerializedRecalc;
  after?: SerializedRecalc;
}> {
  await requireSession();
  try {
    const r = await recalcFromPositions(driveId);
    return { ok: true, before: serializeRecalc(r.before), after: serializeRecalc(r.after) };
  } catch (e) {
    logger.error({ event: "drives.recalc.error", id: driveId, err: String(e) }, "drives.recalc failed");
    return { ok: false, error: "Recalcul impossible." };
  }
}

export async function applyRecalcDriveAction(
  driveId: number,
  after: SerializedRecalc,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  try {
    await applyDriveRecalc(driveId, {
      start_date: after.start_date ? new Date(after.start_date) : null,
      end_date: after.end_date ? new Date(after.end_date) : null,
      distance: after.distance,
      duration_min: after.duration_min,
      ascent: after.ascent,
      descent: after.descent,
      speed_max: after.speed_max,
    });
  } catch (e) {
    logger.error(
      { event: "drives.recalc.apply.error", id: driveId, err: String(e) },
      "drives.recalc.apply failed",
    );
    return { ok: false, error: "Échec de l'application du recalcul." };
  }

  logger.info(
    { event: "drives.recalc.apply", user: session.userId, id: driveId },
    "drives.recalc.apply",
  );
  revalidatePath(`/drives/${driveId}`);
  return { ok: true };
}
