"use server";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { FKOption } from "@/components/form/fk-combobox";

const LIMIT = 20;

/**
 * Typeahead pour les FK geofence. Recherche ILIKE sur name. Limit 20.
 * Sans query : retourne les 20 premières (id asc, ordre déterministe).
 */
export async function searchGeofencesAction(query: string): Promise<FKOption[]> {
  await requireSession();
  const q = query.trim();
  const where = q
    ? { name: { contains: q, mode: "insensitive" as const } }
    : {};

  const rows = await prisma.geofences.findMany({
    where,
    orderBy: { id: "asc" },
    take: LIMIT,
    select: { id: true, name: true },
  });

  return rows.map((g) => ({ id: g.id, label: g.name }));
}
