"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type CarActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const optionalFloat = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine(
    (v) => {
      if (v == null) return true;
      const n = Number(v);
      return Number.isFinite(n);
    },
    { message: "invalidNumber" },
  );

const requiredSmallInt = z
  .string()
  .transform((v) => v.trim())
  .refine(
    (v) => {
      if (v === "") return false;
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 32767;
    },
    { message: "invalidNumber" },
  );

const displayPrioritySchema = z
  .string()
  .transform((v) => v.trim())
  .refine(
    (v) => {
      if (v === "") return false;
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 32767;
    },
    { message: "invalidPriority" },
  );

const CarInputSchema = z.object({
  // cars.*
  name: optionalString(255),
  model: optionalString(255),
  marketing_name: optionalString(255),
  trim_badging: optionalString(255),
  exterior_color: optionalString(255),
  spoiler_type: optionalString(255),
  wheel_type: optionalString(255),
  display_priority: displayPrioritySchema,
  efficiency: optionalFloat,
  // car_settings.*
  suspend_min: requiredSmallInt,
  suspend_after_idle_min: requiredSmallInt,
});

const checkboxes = [
  "req_not_unlocked",
  "free_supercharging",
  "use_streaming_api",
  "enabled",
  "lfp_battery",
] as const;

function readOnlyResult(): CarActionState {
  return { ok: false, error: "Application en lecture seule." };
}

export async function updateCarAction(
  id: number,
  _prev: CarActionState | null,
  formData: FormData,
): Promise<CarActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnlyResult();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = CarInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0];
      if (typeof path === "string") fe[path] = issue.message;
    }
    return { ok: false, error: "Données invalides.", fieldErrors: fe };
  }

  const data = parsed.data;
  const flags = Object.fromEntries(
    checkboxes.map((k) => [k, raw[k] === "1" || raw[k] === "on" || raw[k] === "true"]),
  ) as Record<(typeof checkboxes)[number], boolean>;

  const car = await prisma.cars.findUnique({
    where: { id },
    select: { settings_id: true },
  });
  if (!car) return { ok: false, error: "Véhicule introuvable." };

  try {
    // Le couple cars + car_settings est mis à jour atomiquement : si l'un des
    // deux échoue (contrainte, indispo), aucune modification n'est persistée.
    await prisma.$transaction([
      prisma.cars.update({
        where: { id },
        data: {
          name: data.name ?? null,
          model: data.model ?? null,
          marketing_name: data.marketing_name ?? null,
          trim_badging: data.trim_badging ?? null,
          exterior_color: data.exterior_color ?? null,
          spoiler_type: data.spoiler_type ?? null,
          wheel_type: data.wheel_type ?? null,
          display_priority: parseInt(data.display_priority, 10),
          efficiency: data.efficiency != null ? Number(data.efficiency) : null,
          updated_at: new Date(),
        },
      }),
      prisma.car_settings.update({
        where: { id: car.settings_id },
        data: {
          suspend_min: parseInt(data.suspend_min, 10),
          suspend_after_idle_min: parseInt(data.suspend_after_idle_min, 10),
          req_not_unlocked: flags.req_not_unlocked,
          free_supercharging: flags.free_supercharging,
          use_streaming_api: flags.use_streaming_api,
          enabled: flags.enabled,
          lfp_battery: flags.lfp_battery,
        },
      }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Véhicule ou réglages introuvables." };
    }
    logger.error({ event: "cars.update.error", id, err: String(e) }, "cars.update failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "cars.update",
      user: session.userId,
      id,
      diff_keys: [...Object.keys(data), ...checkboxes],
    },
    "cars.update",
  );

  revalidatePath("/cars");
  revalidatePath(`/cars/${id}`);
  return { ok: true };
}
