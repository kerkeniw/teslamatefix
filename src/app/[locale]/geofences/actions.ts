"use server";

import { z } from "zod";
import { Prisma, billing_type } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { GeofenceFormState } from "@/components/entities/geofences/GeofenceForm";

type GeofenceFieldErrors = NonNullable<GeofenceFormState["fieldErrors"]>;

const decimalInRange = (min: number, max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v !== "", { message: "Champ obligatoire." })
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= min && n <= max;
      },
      { message: "Valeur hors limites." },
    );

const optionalDecimalInRange = (min: number, max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine(
      (v) => {
        if (v == null) return true;
        const n = Number(v);
        return Number.isFinite(n) && n >= min && n <= max;
      },
      { message: "Valeur hors limites." },
    );

const GeofenceInputSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length >= 1 && v.length <= 255, {
      message: "Nom requis (max 255 caractères).",
    }),
  latitude: decimalInRange(-90, 90),
  longitude: decimalInRange(-180, 180),
  radius: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v !== "", { message: "Rayon requis." })
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= 1 && n <= 32767;
      },
      { message: "Rayon entre 1 et 32767 mètres." },
    ),
  billing_type: z.enum(["per_kwh", "per_minute"]),
  cost_per_unit: optionalDecimalInRange(0, 99.9999),
  session_fee: optionalDecimalInRange(0, 9999.99),
});

function readOnlyResult(): GeofenceFormState {
  return { ok: false, error: "Application en lecture seule." };
}

function fieldErrorsFromZod(err: z.ZodError): GeofenceFieldErrors {
  const fe: GeofenceFieldErrors = {};
  for (const issue of err.issues) {
    const path = issue.path[0];
    if (typeof path === "string") {
      fe[path as keyof GeofenceFieldErrors] = issue.message;
    }
  }
  return fe;
}

export async function createGeofenceAction(
  _prev: GeofenceFormState | null,
  formData: FormData,
): Promise<GeofenceFormState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnlyResult();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = GeofenceInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const data = parsed.data;
  const now = new Date();

  let createdId: number;
  try {
    const created = await prisma.geofences.create({
      data: {
        name: data.name,
        latitude: new Prisma.Decimal(data.latitude),
        longitude: new Prisma.Decimal(data.longitude),
        radius: parseInt(data.radius, 10),
        billing_type: data.billing_type as billing_type,
        cost_per_unit: data.cost_per_unit ? new Prisma.Decimal(data.cost_per_unit) : null,
        session_fee: data.session_fee ? new Prisma.Decimal(data.session_fee) : null,
        inserted_at: now,
        updated_at: now,
      },
      select: { id: true },
    });
    createdId = created.id;
  } catch (e) {
    logger.error({ event: "geofences.create.error", err: String(e) }, "geofences.create failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "geofences.create",
      user: session.userId,
      id: createdId,
      diff_keys: Object.keys(data),
    },
    "geofences.create",
  );

  revalidatePath("/geofences");
  redirect(`/geofences/${createdId}`);
}

export async function updateGeofenceAction(
  id: number,
  _prev: GeofenceFormState | null,
  formData: FormData,
): Promise<GeofenceFormState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnlyResult();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = GeofenceInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const data = parsed.data;

  try {
    await prisma.geofences.update({
      where: { id },
      data: {
        name: data.name,
        latitude: new Prisma.Decimal(data.latitude),
        longitude: new Prisma.Decimal(data.longitude),
        radius: parseInt(data.radius, 10),
        billing_type: data.billing_type as billing_type,
        cost_per_unit: data.cost_per_unit ? new Prisma.Decimal(data.cost_per_unit) : null,
        session_fee: data.session_fee ? new Prisma.Decimal(data.session_fee) : null,
        updated_at: new Date(),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Géofence introuvable." };
    }
    logger.error({ event: "geofences.update.error", id, err: String(e) }, "geofences.update failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "geofences.update",
      user: session.userId,
      id,
      diff_keys: Object.keys(data),
    },
    "geofences.update",
  );

  revalidatePath("/geofences");
  revalidatePath(`/geofences/${id}`);
  return { ok: true };
}

export async function deleteGeofenceAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  try {
    await prisma.geofences.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Géofence introuvable." };
    }
    logger.error({ event: "geofences.delete.error", id, err: String(e) }, "geofences.delete failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info({ event: "geofences.delete", user: session.userId, id }, "geofences.delete");
  revalidatePath("/geofences");
  return { ok: true };
}
