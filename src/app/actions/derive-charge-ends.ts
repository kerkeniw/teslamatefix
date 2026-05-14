"use server";

import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { deriveEndFields, type DerivedEndFields } from "@/lib/integrity/charges-derive";

const InputSchema = z.object({
  car_id: z.number().int().positive(),
  start_battery_level: z.number().int().min(0).max(100).nullable(),
  start_ideal_range_km: z.number().nullable(),
  start_rated_range_km: z.number().nullable(),
  charge_energy_added: z.number().nullable(),
});

export type DeriveChargeEndsInput = z.infer<typeof InputSchema>;

export type DeriveChargeEndsResult = {
  ok: boolean;
  derived?: DerivedEndFields;
  error?: string;
};

export async function deriveChargeEndsAction(
  input: DeriveChargeEndsInput,
): Promise<DeriveChargeEndsResult> {
  await requireSession();
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Paramètres invalides." };
  }
  const derived = await deriveEndFields(parsed.data);
  return { ok: true, derived };
}
