"use server";

import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSelectedCarId } from "@/lib/vehicle";
import type { FKOption } from "@/components/form/fk-combobox";

const LIMIT = 20;

function positionLabel(p: {
  id: number;
  date: Date;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
}): string {
  // Format compact pour rentrer dans l'input du combobox.
  const ts = p.date.toISOString().slice(0, 16).replace("T", " ");
  return `#${p.id} · ${ts} (${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)})`;
}

/**
 * Typeahead pour les FK position.
 *
 * - Par id direct si la query est numérique (l'utilisateur connaît l'id) →
 *   match exact + voisins (id <= q desc).
 * - Sinon, fallback aux N dernières positions du véhicule sélectionné.
 *
 * Toujours scopé au car_id sélectionné pour éviter de balayer les 4M+ lignes.
 */
export async function searchPositionsAction(query: string): Promise<FKOption[]> {
  await requireSession();
  const carId = await getSelectedCarId();
  const q = query.trim();

  const where: Prisma.positionsWhereInput = {};
  if (carId != null) where.car_id = carId;
  if (/^\d+$/.test(q)) {
    const id = Number.parseInt(q, 10);
    where.id = { lte: id };
  }

  const rows = await prisma.positions.findMany({
    where,
    orderBy: { id: "desc" },
    take: LIMIT,
    select: { id: true, date: true, latitude: true, longitude: true },
  });

  return rows.map((p) => ({ id: p.id, label: positionLabel(p) }));
}
