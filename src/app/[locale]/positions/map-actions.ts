"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import {
  BATCH_SIZE,
  serializeMapPoint,
  type MapPoint,
  type RawMapPoint,
} from "@/lib/positions/map-points";

export type MapBatchInput = {
  driveId?: number | null;
  from?: string | null;
  to?: string | null;
  cursor?: number | null;
};

export type MapBatchResult = {
  points: MapPoint[];
  nextCursor: number | null;
  done: boolean;
};

const EMPTY: MapBatchResult = { points: [], nextCursor: null, done: true };

/**
 * Charge un lot de points de la carte, paginé par curseur `id` croissant.
 * Appelé en boucle depuis le client (`PositionsMapPanel`) jusqu'à `done`.
 *
 * Contrairement au tableau, la carte n'a **pas** de plafond de plage (31 j) :
 * le chargement incrémental par lots absorbe le volume. Le scope `car_id` reste
 * systématique.
 */
export async function fetchPositionMapBatchAction(
  input: MapBatchInput,
): Promise<MapBatchResult> {
  await requireSession();

  const driveId =
    input.driveId != null && Number.isInteger(input.driveId) && input.driveId > 0
      ? input.driveId
      : null;
  const cursor =
    input.cursor != null && Number.isInteger(input.cursor) && input.cursor > 0
      ? input.cursor
      : null;

  const where: Prisma.positionsWhereInput = {};

  if (driveId != null) {
    where.drive_id = driveId;
  } else {
    const car = await getSelectedCarOrDefault();
    if (!car) return EMPTY;
    where.car_id = car.id;

    const from = input.from && !Number.isNaN(new Date(input.from).getTime()) ? new Date(input.from) : null;
    const to = input.to && !Number.isNaN(new Date(input.to).getTime()) ? new Date(input.to) : null;
    if (from || to) {
      where.date = {};
      if (from) (where.date as Prisma.DateTimeFilter).gte = from;
      if (to) (where.date as Prisma.DateTimeFilter).lte = to;
    }
  }

  if (cursor != null) where.id = { gt: cursor };

  const found = await prisma.positions.findMany({
    where,
    orderBy: { id: "asc" },
    take: BATCH_SIZE + 1,
    select: {
      id: true,
      date: true,
      latitude: true,
      longitude: true,
      drive_id: true,
      speed: true,
      power: true,
    },
  });

  const hasMore = found.length > BATCH_SIZE;
  const batch = hasMore ? found.slice(0, BATCH_SIZE) : found;
  const points = (batch as RawMapPoint[]).map(serializeMapPoint);

  return {
    points,
    nextCursor: hasMore ? batch[batch.length - 1].id : null,
    done: !hasMore,
  };
}
