"use server";

import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSelectedCarId } from "@/lib/vehicle";
import type { FKOption } from "@/components/form/fk-combobox";

const LIMIT = 20;

function driveLabel(d: {
  id: number;
  start_date: Date;
  end_date: Date | null;
  distance: number | null;
}): string {
  const ts = d.start_date.toISOString().slice(0, 16).replace("T", " ");
  const dist = d.distance != null ? ` · ${d.distance.toFixed(1)} km` : "";
  return `#${d.id} · ${ts}${dist}`;
}

/**
 * Typeahead pour les FK drive (utilisé surtout par PositionForm).
 * Scope par car_id sélectionné pour rester pertinent.
 */
export async function searchDrivesAction(query: string): Promise<FKOption[]> {
  await requireSession();
  const carId = await getSelectedCarId();
  const q = query.trim();

  const where: Prisma.drivesWhereInput = {};
  if (carId != null) where.car_id = carId;
  if (/^\d+$/.test(q)) {
    const id = Number.parseInt(q, 10);
    where.id = { lte: id };
  }

  const rows = await prisma.drives.findMany({
    where,
    orderBy: { id: "desc" },
    take: LIMIT,
    select: { id: true, start_date: true, end_date: true, distance: true },
  });

  return rows.map((d) => ({ id: d.id, label: driveLabel(d) }));
}
