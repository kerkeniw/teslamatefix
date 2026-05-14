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
  type ProcessRecalc,
} from "@/lib/integrity/charges";

export type ChargeActionState = {
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

const optionalNonNegative = z
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

const positionIdSchema = z
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

const ChargeSchema = z
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

  try {
    await prisma.charging_processes.update({
      where: { id },
      data,
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
    { event: "charges.update", user: session.userId, id, diff_keys: Object.keys(parsed.data) },
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
