"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { updateSettings } from "@/lib/integrity/settings";
import type { SettingsFormState } from "@/components/entities/settings/SettingsForm";

type SettingsFieldErrors = NonNullable<SettingsFormState["fieldErrors"]>;

const optionalUrl = z
  .string()
  .max(255)
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const SettingsInputSchema = z.object({
  unit_of_length: z.enum(["km", "mi"]),
  unit_of_temperature: z.enum(["C", "F"]),
  unit_of_pressure: z.enum(["bar", "psi"]),
  preferred_range: z.enum(["ideal", "rated"]),
  language: z
    .string()
    .max(8)
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, { message: "Code de langue requis." }),
  base_url: optionalUrl,
  grafana_url: optionalUrl,
});

function readOnlyResult(): SettingsFormState {
  return { ok: false, error: "Application en lecture seule." };
}

function fieldErrorsFromZod(err: z.ZodError): SettingsFieldErrors {
  const fe: SettingsFieldErrors = {};
  for (const issue of err.issues) {
    const path = issue.path[0];
    if (typeof path === "string") {
      fe[path as keyof SettingsFieldErrors] = issue.message;
    }
  }
  return fe;
}

export async function updateSettingsAction(
  _prev: SettingsFormState | null,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnlyResult();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = SettingsInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Données invalides.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const data = parsed.data;
  try {
    await updateSettings({
      unit_of_length: data.unit_of_length,
      unit_of_temperature: data.unit_of_temperature,
      unit_of_pressure: data.unit_of_pressure,
      preferred_range: data.preferred_range,
      language: data.language,
      base_url: data.base_url ?? null,
      grafana_url: data.grafana_url ?? null,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Ligne settings (id=1) introuvable." };
    }
    logger.error({ event: "settings.update.error", err: String(e) }, "settings.update failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "settings.update",
      user: session.userId,
      diff_keys: Object.keys(data),
    },
    "settings.update",
  );

  revalidatePath("/settings");
  return { ok: true };
}
