"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { closePreviousOpenState } from "@/lib/integrity/states";
import type { StateFormState } from "@/components/entities/states/StateForm";

type StateFieldErrors = NonNullable<StateFormState["fieldErrors"]>;

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

const StateInputSchema = z
  .object({
    state: z.enum(["online", "offline", "asleep"], {
      message: "stateRequired",
    }),
    start_date: dateString,
    end_date: optionalDateString,
    car_id: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v !== "", { message: "carRequired" })
      .refine(
        (v) => {
          const n = Number(v);
          return Number.isInteger(n) && n >= 1 && n <= 32767;
        },
        { message: "carRequired" },
      ),
  })
  .refine(
    (data) => {
      if (!data.end_date) return true;
      return new Date(data.end_date).getTime() >= new Date(data.start_date).getTime();
    },
    { path: ["end_date"], message: "endBeforeStart" },
  );

function readOnlyResult(): StateFormState {
  return { ok: false, error: "Application en lecture seule." };
}

function fieldErrorsFromZod(err: z.ZodError): StateFieldErrors {
  const fe: StateFieldErrors = {};
  for (const issue of err.issues) {
    const path = issue.path[0];
    if (typeof path === "string") {
      fe[path as keyof StateFieldErrors] = issue.message;
    }
  }
  return fe;
}

export async function createStateAction(
  _prev: StateFormState | null,
  formData: FormData,
): Promise<StateFormState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnlyResult();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = StateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const data = parsed.data;
  const carId = parseInt(data.car_id, 10);
  const startDate = new Date(data.start_date);
  const endDate = data.end_date ? new Date(data.end_date) : null;
  const closePrevious = raw.close_previous === "1" || raw.close_previous === "on";

  let createdId: number;
  try {
    // Si on crée un état ouvert (end_date NULL) on doit garantir qu'il n'en
    // existe pas déjà un autre ouvert pour ce car_id. Soit on demande à
    // l'utilisateur de cocher "close_previous" (clôture automatique), soit on
    // refuse l'opération avec une erreur explicite.
    const created = await prisma.$transaction(async (tx) => {
      if (endDate === null) {
        const existing = await tx.states.findFirst({
          where: { car_id: carId, end_date: null },
          select: { id: true },
        });
        if (existing) {
          if (closePrevious) {
            await closePreviousOpenState(carId, startDate, tx);
          } else {
            throw new OpenStateConflict();
          }
        }
      }
      return tx.states.create({
        data: {
          state: data.state,
          start_date: startDate,
          end_date: endDate,
          car_id: carId,
        },
        select: { id: true },
      });
    });
    createdId = created.id;
  } catch (e) {
    if (e instanceof OpenStateConflict) {
      return { ok: false, fieldErrors: { end_date: "openStateExists" } };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, error: "Véhicule introuvable." };
    }
    if (
      e instanceof Prisma.PrismaClientUnknownRequestError ||
      (e instanceof Error && /check constraint/i.test(e.message))
    ) {
      return { ok: false, fieldErrors: { end_date: "endBeforeStart" } };
    }
    logger.error({ event: "states.create.error", err: String(e) }, "states.create failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "states.create",
      user: session.userId,
      id: createdId,
      car_id: carId,
      state: data.state,
      closed_previous: closePrevious && endDate === null,
    },
    "states.create",
  );

  revalidatePath("/states");
  redirect(`/states/${createdId}`);
}

export async function updateStateAction(
  id: number,
  _prev: StateFormState | null,
  formData: FormData,
): Promise<StateFormState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnlyResult();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = StateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const data = parsed.data;
  const carId = parseInt(data.car_id, 10);
  const startDate = new Date(data.start_date);
  const endDate = data.end_date ? new Date(data.end_date) : null;
  const closePrevious = raw.close_previous === "1" || raw.close_previous === "on";

  try {
    await prisma.$transaction(async (tx) => {
      // Cas où l'état devient ouvert : vérifier qu'aucun autre état ouvert
      // n'existe déjà pour ce véhicule (en excluant l'état en cours d'édition).
      if (endDate === null) {
        const existing = await tx.states.findFirst({
          where: { car_id: carId, end_date: null, NOT: { id } },
          select: { id: true },
        });
        if (existing) {
          if (closePrevious) {
            await closePreviousOpenState(carId, startDate, tx);
          } else {
            throw new OpenStateConflict();
          }
        }
      }
      await tx.states.update({
        where: { id },
        data: {
          state: data.state,
          start_date: startDate,
          end_date: endDate,
          car_id: carId,
        },
      });
    });
  } catch (e) {
    if (e instanceof OpenStateConflict) {
      return { ok: false, fieldErrors: { end_date: "openStateExists" } };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return { ok: false, error: "État introuvable." };
      if (e.code === "P2003") return { ok: false, error: "Véhicule introuvable." };
    }
    if (
      e instanceof Prisma.PrismaClientUnknownRequestError ||
      (e instanceof Error && /check constraint/i.test(e.message))
    ) {
      return { ok: false, fieldErrors: { end_date: "endBeforeStart" } };
    }
    logger.error({ event: "states.update.error", id, err: String(e) }, "states.update failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "states.update",
      user: session.userId,
      id,
      diff_keys: Object.keys(data),
    },
    "states.update",
  );

  revalidatePath("/states");
  revalidatePath(`/states/${id}`);
  return { ok: true };
}

export async function deleteStateAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  try {
    await prisma.states.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "État introuvable." };
    }
    logger.error({ event: "states.delete.error", id, err: String(e) }, "states.delete failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info({ event: "states.delete", user: session.userId, id }, "states.delete");
  revalidatePath("/states");
  return { ok: true };
}

// Sentinel utilisé pour propager le conflit d'état ouvert hors de la transaction
// (Prisma transforme automatiquement les erreurs synchrones en rollback).
class OpenStateConflict extends Error {
  constructor() {
    super("OPEN_STATE_CONFLICT");
    this.name = "OpenStateConflict";
  }
}
