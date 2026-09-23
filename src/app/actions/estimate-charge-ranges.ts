"use server";

import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { estimateRangesAtLevel } from "@/lib/integrity/full-range";

const InputSchema = z.object({
  carId: z.number().int().positive(),
  date: z.string().min(1),
  batteryLevel: z.number().int().min(1).max(100),
});

/**
 * Autonomies idéale/rated (km) déduites d'un SOC saisi sur une charge, d'après
 * l'autonomie à 100 % mesurée au plus près de la date (début ou fin de session).
 */
export async function estimateChargeRangesAction(
  input: z.infer<typeof InputSchema>,
): Promise<{ idealRangeKm: number | null; ratedRangeKm: number | null }> {
  await requireSession();
  const parsed = InputSchema.safeParse(input);
  const date = parsed.success ? new Date(parsed.data.date) : null;
  if (!parsed.success || date == null || Number.isNaN(date.getTime())) {
    return { idealRangeKm: null, ratedRangeKm: null };
  }
  return estimateRangesAtLevel(parsed.data.carId, date, parsed.data.batteryLevel);
}
