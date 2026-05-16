"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  enrichPositionFields,
  findPositionAfter,
  findPositionBefore,
  type PositionSnapshot,
} from "@/lib/integrity/positions-around";
import { deriveChargerSpecs, type ChargerSpecs } from "@/lib/integrity/charger-specs";
import { haversineKm } from "@/lib/integrity/drives";
import type { FKOption } from "@/components/form/fk-combobox";

const InputSchema = z.object({
  car_id: z.number().int().positive(),
  start_date: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "invalidDate",
  }),
  end_date: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "invalidDate",
  }),
  charger_type: z.enum(["AC", "DC"]),
  charger_power_kw: z.number().int().positive(),
});

export type PrepareChargeContextInput = z.infer<typeof InputSchema>;

export type PositionDto = {
  id: number;
  date: string;
  latitude: number;
  longitude: number;
  odometer: number | null;
  outside_temp: number | null;
  inside_temp: number | null;
  battery_level: number | null;
  usable_battery_level: number | null;
  ideal_battery_range_km: number | null;
  rated_battery_range_km: number | null;
  est_battery_range_km: number | null;
  elevation: number | null;
};

export type PrepareChargeContextResult = {
  ok: boolean;
  error?: string;
  position_before?: PositionDto | null;
  position_after?: PositionDto | null;
  // Snapshots bruts DB (avant enrichissement par fallback). Servent côté
  // client à remplir les hidden `initial_<f>` pour que le serveur détecte
  // correctement un diff lors du submit.
  position_before_original?: PositionDto | null;
  position_after_original?: PositionDto | null;
  address?: FKOption | null;
  geofence?: FKOption | null;
  derived_charger?: ChargerSpecs;
};

function toDto(p: PositionSnapshot | null): PositionDto | null {
  if (!p) return null;
  const num = (v: Prisma.Decimal | null): number | null =>
    v == null ? null : Number(v);
  return {
    id: p.id,
    date: p.date.toISOString(),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    odometer: p.odometer,
    outside_temp: num(p.outside_temp),
    inside_temp: num(p.inside_temp),
    battery_level: p.battery_level,
    usable_battery_level: p.usable_battery_level,
    ideal_battery_range_km: num(p.ideal_battery_range_km),
    rated_battery_range_km: num(p.rated_battery_range_km),
    est_battery_range_km: num(p.est_battery_range_km),
    elevation: p.elevation,
  };
}

async function findGeofenceAt(
  latitude: number,
  longitude: number,
): Promise<FKOption | null> {
  // Matching local : on charge tous les geofences (généralement quelques
  // dizaines) et on garde celui dont le centre est à <= radius mètres du
  // point. En cas d'égalité, le plus proche gagne.
  const geofences = await prisma.geofences.findMany({
    select: { id: true, name: true, latitude: true, longitude: true, radius: true },
  });
  let best: { id: number; name: string; distanceM: number } | null = null;
  for (const g of geofences) {
    const distanceKm = haversineKm(
      latitude,
      longitude,
      Number(g.latitude),
      Number(g.longitude),
    );
    const distanceM = distanceKm * 1000;
    if (distanceM <= g.radius && (best == null || distanceM < best.distanceM)) {
      best = { id: g.id, name: g.name, distanceM };
    }
  }
  return best ? { id: best.id, label: best.name } : null;
}

const ADDRESS_RADIUS_M = 100;

function addressLabel(a: {
  id: number;
  display_name: string | null;
  road: string | null;
  city: string | null;
  country: string | null;
}): string {
  const parts = [a.road, a.city, a.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : (a.display_name ?? `#${a.id}`);
}

async function findAddressNear(
  latitude: number,
  longitude: number,
): Promise<FKOption | null> {
  // ±0.001 deg ≈ ±111 m en latitude ; longitude varie selon la latitude
  // mais à des latitudes tempérées (40-55°) ±0.0015 deg ≈ ±100-130 m.
  // On élargit légèrement la bbox et on filtre au mètre près via haversine.
  const latDelta = 0.001;
  const lonDelta = 0.0015;
  const candidates = await prisma.addresses.findMany({
    where: {
      latitude: { gte: latitude - latDelta, lte: latitude + latDelta },
      longitude: { gte: longitude - lonDelta, lte: longitude + lonDelta },
    },
    orderBy: { id: "desc" },
    take: 50,
    select: {
      id: true,
      display_name: true,
      road: true,
      city: true,
      country: true,
      latitude: true,
      longitude: true,
    },
  });
  for (const a of candidates) {
    if (a.latitude == null || a.longitude == null) continue;
    const distanceM =
      haversineKm(latitude, longitude, Number(a.latitude), Number(a.longitude)) *
      1000;
    if (distanceM <= ADDRESS_RADIUS_M) {
      return { id: a.id, label: addressLabel(a) };
    }
  }
  return null;
}

export async function prepareChargeContextAction(
  input: PrepareChargeContextInput,
): Promise<PrepareChargeContextResult> {
  await requireSession();

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Paramètres invalides." };
  }
  const { car_id, start_date, end_date, charger_type, charger_power_kw } =
    parsed.data;

  const startD = new Date(start_date);
  const endD = new Date(end_date);

  const [beforeRaw, afterRaw] = await Promise.all([
    findPositionBefore(car_id, startD),
    findPositionAfter(car_id, endD),
  ]);

  // Bug 1 — enrichir les champs batterie/temp/range NULL en remontant /
  // avançant dans le temps jusqu'à trouver une position voisine qui les a.
  const [before, after] = await Promise.all([
    beforeRaw ? enrichPositionFields(car_id, beforeRaw, "before") : null,
    afterRaw ? enrichPositionFields(car_id, afterRaw, "after") : null,
  ]);

  const derived = deriveChargerSpecs(charger_type, charger_power_kw);

  const [geofence, address] = before
    ? await Promise.all([
        findGeofenceAt(Number(before.latitude), Number(before.longitude)),
        findAddressNear(Number(before.latitude), Number(before.longitude)),
      ])
    : [null, null];

  logger.info(
    {
      event: "charges.prepareContext",
      car_id,
      charger_type,
      charger_power_kw,
      derived_voltage: derived.voltage,
      derived_phases: derived.phases,
      derived_current: derived.current,
      derived_fast: derived.fast_charger_present,
      position_before_id: before?.id ?? null,
      position_after_id: after?.id ?? null,
      address_id: address?.id ?? null,
      geofence_id: geofence?.id ?? null,
    },
    "charges.prepareContext",
  );

  return {
    ok: true,
    position_before: toDto(before),
    position_after: toDto(after),
    position_before_original: toDto(beforeRaw),
    position_after_original: toDto(afterRaw),
    address,
    geofence,
    derived_charger: derived,
  };
}
