"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { UpdateFormState } from "@/components/entities/updates/UpdateForm";

type UpdateFieldErrors = NonNullable<UpdateFormState["fieldErrors"]>;

const dateString = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v !== "", { message: "Date requise." })
  .refine(
    (v) => {
      const d = new Date(v);
      return !Number.isNaN(d.getTime());
    },
    { message: "Date invalide." },
  );

const optionalDateString = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine(
    (v) => {
      if (v == null) return true;
      const d = new Date(v);
      return !Number.isNaN(d.getTime());
    },
    { message: "Date invalide." },
  );

const UpdateInputSchema = z
  .object({
    start_date: dateString,
    end_date: optionalDateString,
    version: z
      .string()
      .max(255)
      .transform((v) => v.trim())
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    car_id: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v !== "", { message: "Véhicule requis." })
      .refine(
        (v) => {
          const n = Number(v);
          return Number.isInteger(n) && n >= 1 && n <= 32767;
        },
        { message: "Identifiant véhicule invalide." },
      ),
  })
  .refine(
    (data) => {
      if (!data.end_date) return true;
      return new Date(data.end_date).getTime() >= new Date(data.start_date).getTime();
    },
    {
      path: ["end_date"],
      message: "La date de fin ne peut pas être antérieure à la date de début.",
    },
  );

function readOnlyResult(): UpdateFormState {
  return { ok: false, error: "Application en lecture seule." };
}

function fieldErrorsFromZod(err: z.ZodError): UpdateFieldErrors {
  const fe: UpdateFieldErrors = {};
  for (const issue of err.issues) {
    const path = issue.path[0];
    if (typeof path === "string") {
      fe[path as keyof UpdateFieldErrors] = issue.message;
    }
  }
  return fe;
}

export async function createUpdateAction(
  _prev: UpdateFormState | null,
  formData: FormData,
): Promise<UpdateFormState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnlyResult();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = UpdateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const data = parsed.data;
  let createdId: number;
  try {
    const created = await prisma.updates.create({
      data: {
        start_date: new Date(data.start_date),
        end_date: data.end_date ? new Date(data.end_date) : null,
        version: data.version ?? null,
        car_id: parseInt(data.car_id, 10),
      },
      select: { id: true },
    });
    createdId = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2003") {
        return { ok: false, error: "Véhicule introuvable." };
      }
    }
    if (
      e instanceof Prisma.PrismaClientUnknownRequestError ||
      (e instanceof Error && /check constraint/i.test(e.message))
    ) {
      return {
        ok: false,
        fieldErrors: {
          end_date: "La date de fin ne peut pas être antérieure à la date de début.",
        },
      };
    }
    logger.error({ event: "updates.create.error", err: String(e) }, "updates.create failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "updates.create",
      user: session.userId,
      id: createdId,
      diff_keys: Object.keys(data),
    },
    "updates.create",
  );

  revalidatePath("/updates");
  redirect(`/updates/${createdId}`);
}

export async function updateUpdateAction(
  id: number,
  _prev: UpdateFormState | null,
  formData: FormData,
): Promise<UpdateFormState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnlyResult();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = UpdateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const data = parsed.data;
  try {
    await prisma.updates.update({
      where: { id },
      data: {
        start_date: new Date(data.start_date),
        end_date: data.end_date ? new Date(data.end_date) : null,
        version: data.version ?? null,
        car_id: parseInt(data.car_id, 10),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return { ok: false, error: "Mise à jour introuvable." };
      if (e.code === "P2003") return { ok: false, error: "Véhicule introuvable." };
    }
    if (
      e instanceof Prisma.PrismaClientUnknownRequestError ||
      (e instanceof Error && /check constraint/i.test(e.message))
    ) {
      return {
        ok: false,
        fieldErrors: {
          end_date: "La date de fin ne peut pas être antérieure à la date de début.",
        },
      };
    }
    logger.error({ event: "updates.update.error", id, err: String(e) }, "updates.update failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "updates.update",
      user: session.userId,
      id,
      diff_keys: Object.keys(data),
    },
    "updates.update",
  );

  revalidatePath("/updates");
  revalidatePath(`/updates/${id}`);
  return { ok: true };
}

export async function deleteUpdateAction(
  id: number,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  try {
    await prisma.updates.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Mise à jour introuvable." };
    }
    logger.error({ event: "updates.delete.error", id, err: String(e) }, "updates.delete failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info({ event: "updates.delete", user: session.userId, id }, "updates.delete");
  revalidatePath("/updates");
  return { ok: true };
}
