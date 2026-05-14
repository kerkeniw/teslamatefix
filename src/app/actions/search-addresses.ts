"use server";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { FKOption } from "@/components/form/fk-combobox";

const LIMIT = 20;

function addressLabel(a: {
  id: number;
  display_name: string | null;
  city: string | null;
  road: string | null;
  country: string | null;
}): string {
  const parts = [a.road, a.city, a.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : (a.display_name ?? `#${a.id}`);
}

/**
 * Typeahead pour les FK adresse. Recherche ILIKE sur display_name, road,
 * city, country. Limit 20. Sans query : retourne les 20 dernières (id desc).
 */
export async function searchAddressesAction(query: string): Promise<FKOption[]> {
  await requireSession();
  const q = query.trim();

  const where = q
    ? {
        OR: [
          { display_name: { contains: q, mode: "insensitive" as const } },
          { road: { contains: q, mode: "insensitive" as const } },
          { city: { contains: q, mode: "insensitive" as const } },
          { country: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const rows = await prisma.addresses.findMany({
    where,
    orderBy: { id: "desc" },
    take: LIMIT,
    select: {
      id: true,
      display_name: true,
      city: true,
      road: true,
      country: true,
    },
  });

  return rows.map((a) => ({ id: a.id, label: addressLabel(a) }));
}
