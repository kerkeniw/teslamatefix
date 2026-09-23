"use server";

import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { GeofenceBilling } from "@/lib/integrity/charge-cost";

export type GeofenceBillingResult = GeofenceBilling & { name: string };

/** Tarif de recharge d'une géofence (calcul automatique du coût d'une charge). */
export async function getGeofenceBillingAction(
  geofenceId: number,
): Promise<GeofenceBillingResult | null> {
  await requireSession();
  const parsed = z.number().int().positive().safeParse(geofenceId);
  if (!parsed.success) return null;

  const g = await prisma.geofences.findUnique({
    where: { id: parsed.data },
    select: { name: true, billing_type: true, cost_per_unit: true, session_fee: true },
  });
  if (!g) return null;
  return {
    name: g.name,
    billing_type: g.billing_type,
    cost_per_unit: g.cost_per_unit != null ? Number(g.cost_per_unit) : null,
    session_fee: g.session_fee != null ? Number(g.session_fee) : null,
  };
}
