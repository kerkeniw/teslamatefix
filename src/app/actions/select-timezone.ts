"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { TZ_COOKIE, isValidTimeZone } from "@/lib/format/datetime";

const SetSelectedTimezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: "invalid timezone" });

/**
 * Persiste le fuseau horaire choisi dans le cookie httpOnly `tmfix_tz` et
 * revalide la layout pour que SSR + RSC re-rendent dans le nouveau fuseau.
 * Appelée par `<TimezonePicker>` (combobox header) et `<TimezoneDetector>`
 * (auto-detection au premier chargement).
 */
export async function setSelectedTimezoneAction(tz: string): Promise<void> {
  const session = await requireSession();
  const parsed = SetSelectedTimezoneSchema.safeParse(tz);
  if (!parsed.success) {
    logger.warn(
      { event: "timezone.select.invalid", user: session.userId, tz },
      "invalid timezone on select",
    );
    return;
  }

  const store = await cookies();
  store.set(TZ_COOKIE.name, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TZ_COOKIE.maxAge,
  });

  logger.info(
    { event: "timezone.select", user: session.userId, tz: parsed.data },
    "timezone selected",
  );

  revalidatePath("/", "layout");
}
