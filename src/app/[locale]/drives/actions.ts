"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  correctDriveFromPositions,
  applyDriveCorrection,
  type DriveCorrection,
  type DriveCorrectionSerialized,
  type FkLabels,
} from "@/lib/integrity/drives";
import { routeBetween } from "@/lib/geo/route";
import { GeoError } from "@/lib/geo/geocode";
import {
  synthesizeDrive,
  type DriveStartState,
} from "@/lib/integrity/drive-synth";

export type DriveActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const dateString = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v !== "", { message: "Date requise." })
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "Date invalide." });

const optionalDate = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v == null || !Number.isNaN(new Date(v).getTime()), {
    message: "Date invalide.",
  });

const optionalNumber = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v == null || Number.isFinite(Number(v)), {
    message: "invalidNumber",
  });

const optionalIntId = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine(
    (v) => {
      if (v == null) return true;
      const n = Number(v);
      return Number.isInteger(n) && n > 0;
    },
    { message: "invalidNumber" },
  );

const carIdSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v !== "", { message: "carRequired" })
  .refine(
    (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 32767;
    },
    { message: "carRequired" },
  );

const DriveSchema = z
  .object({
    car_id: carIdSchema,
    start_date: dateString,
    end_date: optionalDate,
    start_km: optionalNumber,
    end_km: optionalNumber,
    distance: optionalNumber,
    duration_min: optionalNumber,
    start_address_id: optionalIntId,
    end_address_id: optionalIntId,
    start_geofence_id: optionalIntId,
    end_geofence_id: optionalIntId,
    start_ideal_range_km: optionalNumber,
    end_ideal_range_km: optionalNumber,
    start_rated_range_km: optionalNumber,
    end_rated_range_km: optionalNumber,
    outside_temp_avg: optionalNumber,
    inside_temp_avg: optionalNumber,
    speed_max: optionalNumber,
    power_min: optionalNumber,
    power_max: optionalNumber,
    ascent: optionalNumber,
    descent: optionalNumber,
  })
  .refine(
    (d) => {
      if (!d.end_date) return true;
      return new Date(d.end_date).getTime() >= new Date(d.start_date).getTime();
    },
    { path: ["end_date"], message: "endBeforeStart" },
  );

function readOnly(): DriveActionState {
  return { ok: false, error: "Application en lecture seule." };
}

function feFromZod(err: z.ZodError): Record<string, string> {
  const fe: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path[0];
    if (typeof path === "string" && !fe[path]) {
      fe[path] = issue.message;
    }
  }
  return fe;
}

function decimal(v: string | null) {
  return v == null ? null : new Prisma.Decimal(v);
}
function intOrNull(v: string | null) {
  return v == null ? null : Math.trunc(Number(v));
}
function floatOrNull(v: string | null) {
  return v == null ? null : Number(v);
}

function toDriveData(d: z.infer<typeof DriveSchema>): Prisma.drivesUncheckedCreateInput {
  return {
    car_id: parseInt(d.car_id, 10),
    start_date: new Date(d.start_date),
    end_date: d.end_date ? new Date(d.end_date) : null,
    start_km: floatOrNull(d.start_km),
    end_km: floatOrNull(d.end_km),
    distance: floatOrNull(d.distance),
    duration_min: intOrNull(d.duration_min),
    start_address_id: intOrNull(d.start_address_id),
    end_address_id: intOrNull(d.end_address_id),
    start_geofence_id: intOrNull(d.start_geofence_id),
    end_geofence_id: intOrNull(d.end_geofence_id),
    start_ideal_range_km: decimal(d.start_ideal_range_km),
    end_ideal_range_km: decimal(d.end_ideal_range_km),
    start_rated_range_km: decimal(d.start_rated_range_km),
    end_rated_range_km: decimal(d.end_rated_range_km),
    outside_temp_avg: decimal(d.outside_temp_avg),
    inside_temp_avg: decimal(d.inside_temp_avg),
    speed_max: intOrNull(d.speed_max),
    power_min: intOrNull(d.power_min),
    power_max: intOrNull(d.power_max),
    ascent: intOrNull(d.ascent),
    descent: intOrNull(d.descent),
  };
}

export async function createDriveAction(
  _prev: DriveActionState | null,
  formData: FormData,
): Promise<DriveActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnly();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = DriveSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Données invalides.", fieldErrors: feFromZod(parsed.error) };
  }

  let createdId: number;
  try {
    const created = await prisma.drives.create({
      data: toDriveData(parsed.data),
      select: { id: true },
    });
    createdId = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, error: "Référence introuvable (véhicule, adresse ou géofence)." };
    }
    logger.error({ event: "drives.create.error", err: String(e) }, "drives.create failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    { event: "drives.create", user: session.userId, id: createdId, car_id: parsed.data.car_id },
    "drives.create",
  );

  revalidatePath("/drives");
  redirect(`/drives/${createdId}`);
}

export async function updateDriveAction(
  id: number,
  _prev: DriveActionState | null,
  formData: FormData,
): Promise<DriveActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnly();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = DriveSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Données invalides.", fieldErrors: feFromZod(parsed.error) };
  }

  try {
    await prisma.drives.update({
      where: { id },
      data: toDriveData(parsed.data),
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return { ok: false, error: "Trajet introuvable." };
      if (e.code === "P2003") {
        return { ok: false, error: "Référence introuvable (adresse ou géofence)." };
      }
    }
    logger.error({ event: "drives.update.error", id, err: String(e) }, "drives.update failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    { event: "drives.update", user: session.userId, id, diff_keys: Object.keys(parsed.data) },
    "drives.update",
  );

  revalidatePath("/drives");
  revalidatePath(`/drives/${id}`);
  return { ok: true };
}

export async function deleteDriveAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  try {
    // FK SET NULL côté positions.drive_id géré côté DB ; on fait un update préventif
    // ici uniquement si Prisma ne traduit pas correctement la contrainte ON DELETE.
    // TeslaMate gère déjà la cascade via la migration Ecto, donc delete suffit.
    await prisma.drives.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Trajet introuvable." };
    }
    logger.error({ event: "drives.delete.error", id, err: String(e) }, "drives.delete failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info({ event: "drives.delete", user: session.userId, id }, "drives.delete");
  revalidatePath("/drives");
  return { ok: true };
}

// --- Correction / recalcul d'un trajet (moteur unifié) ---------------------

function serializeCorrection(c: DriveCorrection): DriveCorrectionSerialized {
  return {
    ...c,
    start_date: c.start_date ? c.start_date.toISOString() : null,
    end_date: c.end_date ? c.end_date.toISOString() : null,
  };
}

function deserializeCorrection(s: DriveCorrectionSerialized): DriveCorrection {
  return {
    ...s,
    start_date: s.start_date ? new Date(s.start_date) : null,
    end_date: s.end_date ? new Date(s.end_date) : null,
  };
}

export async function correctDriveAction(driveId: number): Promise<{
  ok: boolean;
  error?: string;
  before?: DriveCorrectionSerialized;
  after?: DriveCorrectionSerialized;
  beforeLabels?: FkLabels;
  afterLabels?: FkLabels;
  positionCount?: number;
  absorbedPositionIds?: number[];
  absorbedCount?: number;
}> {
  await requireSession();
  try {
    const r = await correctDriveFromPositions(driveId);
    return {
      ok: true,
      before: serializeCorrection(r.before),
      after: serializeCorrection(r.after),
      beforeLabels: r.beforeLabels,
      afterLabels: r.afterLabels,
      positionCount: r.positionCount,
      absorbedPositionIds: r.absorbedPositionIds,
      absorbedCount: r.absorbedCount,
    };
  } catch (e) {
    logger.error({ event: "drives.correct.error", id: driveId, err: String(e) }, "drives.correct failed");
    return { ok: false, error: "Correction impossible." };
  }
}

export async function applyCorrectDriveAction(
  driveId: number,
  after: DriveCorrectionSerialized,
  absorbedPositionIds: number[] = [],
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  // NB : la correction/recalcul contourne volontairement le garde READ_ONLY
  // (elle écrit aussi le drive_id des positions réaffectées).

  try {
    await applyDriveCorrection(driveId, deserializeCorrection(after), absorbedPositionIds);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return { ok: false, error: "Trajet introuvable." };
      if (e.code === "P2003") {
        return { ok: false, error: "Référence introuvable (position, adresse ou géofence)." };
      }
    }
    logger.error(
      { event: "drives.correct.apply.error", id: driveId, err: String(e) },
      "drives.correct.apply failed",
    );
    return { ok: false, error: "Échec de la correction." };
  }

  logger.info(
    { event: "drives.correct.apply", user: session.userId, id: driveId },
    "drives.correct.apply",
  );
  revalidatePath("/drives");
  revalidatePath(`/drives/${driveId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Assistant de création : calcul d'itinéraire + génération des positions.
// ---------------------------------------------------------------------------

export type ComputeStartState = {
  odometerKm: number;
  batteryLevel: number | null;
  idealRangeKm: number | null;
  ratedRangeKm: number | null;
  outsideTemp: number | null;
  insideTemp: number | null;
};

export type ComputeDriveInput = {
  carId: number;
  startDate: string; // UTC ISO
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  startStateOverride?: ComputeStartState | null;
};

export type SerializedPosition = {
  car_id: number;
  date: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  odometer: number;
  battery_level: number | null;
  ideal_battery_range_km: number | null;
  rated_battery_range_km: number | null;
  outside_temp: number | null;
  inside_temp: number | null;
};

export type ComputedDrive = {
  drive: {
    end_date: string;
    distance: number;
    duration_min: number;
    start_km: number;
    end_km: number;
    start_ideal_range_km: number | null;
    end_ideal_range_km: number | null;
    start_rated_range_km: number | null;
    end_rated_range_km: number | null;
    outside_temp_avg: number | null;
    inside_temp_avg: number | null;
    speed_max: number | null;
  };
  positions: SerializedPosition[];
  startState: ComputeStartState;
};

export type ComputeDriveResult =
  | { ok: true; needsStartState: true }
  | { ok: true; needsStartState: false; computed: ComputedDrive }
  | { ok: false; error: string };

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Estime l'autonomie idéale/rated à 100 % pour un véhicule à partir de son
 * historique : dernier point (position, sinon charge) ayant à la fois un %
 * batterie > 0 et l'autonomie correspondante, d'où `max = autonomie / (%/100)`.
 * Les deux autonomies sont cherchées séparément (un point peut n'avoir que l'une).
 * Renvoie `null` par champ si rien d'exploitable.
 */
async function estimateFullRange(
  carId: number,
): Promise<{ maxIdealRangeKm: number | null; maxRatedRangeKm: number | null }> {
  function full(level: number | null | undefined, range: number | null): number | null {
    if (level == null || level <= 0 || range == null) return null;
    return range / (level / 100);
  }

  const [posIdeal, posRated] = await Promise.all([
    prisma.positions.findFirst({
      where: { car_id: carId, battery_level: { gt: 0 }, ideal_battery_range_km: { not: null } },
      orderBy: { date: "desc" },
      select: { battery_level: true, ideal_battery_range_km: true },
    }),
    prisma.positions.findFirst({
      where: { car_id: carId, battery_level: { gt: 0 }, rated_battery_range_km: { not: null } },
      orderBy: { date: "desc" },
      select: { battery_level: true, rated_battery_range_km: true },
    }),
  ]);

  let maxIdealRangeKm = full(posIdeal?.battery_level, num(posIdeal?.ideal_battery_range_km));
  let maxRatedRangeKm = full(posRated?.battery_level, num(posRated?.rated_battery_range_km));

  // Repli sur les charges (pas de car_id → via la relation charging_processes).
  if (maxIdealRangeKm == null) {
    const chg = await prisma.charges.findFirst({
      // charges.ideal_battery_range_km est NOT NULL : pas de filtre `not null`.
      where: {
        charging_processes: { car_id: carId },
        battery_level: { gt: 0 },
      },
      orderBy: { date: "desc" },
      select: { battery_level: true, ideal_battery_range_km: true },
    });
    maxIdealRangeKm = full(chg?.battery_level, num(chg?.ideal_battery_range_km));
  }
  if (maxRatedRangeKm == null) {
    const chg = await prisma.charges.findFirst({
      where: {
        charging_processes: { car_id: carId },
        battery_level: { gt: 0 },
        rated_battery_range_km: { not: null },
      },
      orderBy: { date: "desc" },
      select: { battery_level: true, rated_battery_range_km: true },
    });
    maxRatedRangeKm = full(chg?.battery_level, num(chg?.rated_battery_range_km));
  }

  return { maxIdealRangeKm, maxRatedRangeKm };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcule un trajet : récupère l'état de départ (dernière position avant la date,
 * sinon `startStateOverride`), calcule l'itinéraire OSRM et génère les positions.
 * Ne persiste RIEN — renvoie tout au client pour prévisualisation.
 */
export async function computeDriveAction(
  input: ComputeDriveInput,
): Promise<ComputeDriveResult> {
  await requireSession();

  const startDate = new Date(input.startDate);
  if (Number.isNaN(startDate.getTime())) {
    return { ok: false, error: "Date de départ invalide." };
  }
  if (
    !Number.isFinite(input.from?.lat) ||
    !Number.isFinite(input.from?.lon) ||
    !Number.isFinite(input.to?.lat) ||
    !Number.isFinite(input.to?.lon)
  ) {
    return { ok: false, error: "Adresses de départ/arrivée manquantes." };
  }

  // 1) État de départ : override explicite, sinon dernière position connue.
  let startState: DriveStartState | null = null;
  if (input.startStateOverride) {
    startState = input.startStateOverride;
  } else {
    const last = await prisma.positions.findFirst({
      where: { car_id: input.carId, date: { lt: startDate } },
      orderBy: { date: "desc" },
      select: {
        odometer: true,
        battery_level: true,
        ideal_battery_range_km: true,
        rated_battery_range_km: true,
        outside_temp: true,
        inside_temp: true,
      },
    });
    if (last && last.odometer != null) {
      startState = {
        odometerKm: last.odometer,
        batteryLevel: last.battery_level,
        idealRangeKm: num(last.ideal_battery_range_km),
        ratedRangeKm: num(last.rated_battery_range_km),
        outsideTemp: num(last.outside_temp),
        insideTemp: num(last.inside_temp),
      };
    }
  }

  if (!startState) {
    return { ok: true, needsStartState: true };
  }

  // 1bis) Si le % batterie est connu mais pas l'autonomie idéale/rated, la
  // dériver depuis l'historique du véhicule (autonomie à 100 % × %/100).
  if (
    startState.batteryLevel != null &&
    startState.batteryLevel > 0 &&
    (startState.idealRangeKm == null || startState.ratedRangeKm == null)
  ) {
    const { maxIdealRangeKm, maxRatedRangeKm } = await estimateFullRange(input.carId);
    if (startState.idealRangeKm == null && maxIdealRangeKm != null) {
      startState.idealRangeKm = round2((maxIdealRangeKm * startState.batteryLevel) / 100);
    }
    if (startState.ratedRangeKm == null && maxRatedRangeKm != null) {
      startState.ratedRangeKm = round2((maxRatedRangeKm * startState.batteryLevel) / 100);
    }
  }

  // 2) Itinéraire.
  let route;
  try {
    route = await routeBetween(input.from, input.to);
  } catch (e) {
    if (e instanceof GeoError) return { ok: false, error: e.message };
    logger.error({ event: "drives.compute.route_error", err: String(e) }, "route failed");
    return { ok: false, error: "Calcul d'itinéraire impossible." };
  }

  // 3) Synthèse positions + résumé drive.
  const { positions, drive } = synthesizeDrive({
    carId: input.carId,
    coordinates: route.coordinates,
    distanceKm: route.distanceKm,
    durationS: route.durationS,
    startDate,
    startState,
    consumptionWhKm: env.DRIVE_CONSUMPTION_WH_KM,
    ratedWhKm: env.DRIVE_RATED_WH_KM,
  });

  return {
    ok: true,
    needsStartState: false,
    computed: {
      drive: {
        end_date: drive.end_date.toISOString(),
        distance: drive.distance,
        duration_min: drive.duration_min,
        start_km: drive.start_km,
        end_km: drive.end_km,
        start_ideal_range_km: drive.start_ideal_range_km,
        end_ideal_range_km: drive.end_ideal_range_km,
        start_rated_range_km: drive.start_rated_range_km,
        end_rated_range_km: drive.end_rated_range_km,
        outside_temp_avg: drive.outside_temp_avg,
        inside_temp_avg: drive.inside_temp_avg,
        speed_max: drive.speed_max,
      },
      positions: positions.map((p) => ({
        car_id: p.car_id,
        date: p.date.toISOString(),
        latitude: p.latitude,
        longitude: p.longitude,
        speed: p.speed,
        odometer: p.odometer,
        battery_level: p.battery_level,
        ideal_battery_range_km: p.ideal_battery_range_km,
        rated_battery_range_km: p.rated_battery_range_km,
        outside_temp: p.outside_temp,
        inside_temp: p.inside_temp,
      })),
      startState,
    },
  };
}

const requiredIntId = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0;
  }, { message: "addressRequired" });

const CreateWithPositionsSchema = z.object({
  car_id: carIdSchema,
  start_date: dateString,
  start_address_id: requiredIntId,
  end_address_id: requiredIntId,
  start_geofence_id: optionalIntId,
  end_geofence_id: optionalIntId,
});

function decOrNull(v: number | null) {
  return v == null ? null : new Prisma.Decimal(v);
}

/**
 * Persiste le trajet calculé + toutes ses positions en une transaction, puis
 * renseigne start/end_position_id. Le payload calculé (résumé + positions) est
 * posté en champ caché JSON par l'assistant.
 */
export async function createDriveWithPositionsAction(
  _prev: DriveActionState | null,
  formData: FormData,
): Promise<DriveActionState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnly();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = CreateWithPositionsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Données invalides.", fieldErrors: feFromZod(parsed.error) };
  }

  let payload: ComputedDrive;
  try {
    payload = JSON.parse(raw.payload ?? "") as ComputedDrive;
  } catch {
    return { ok: false, error: "Trajet non calculé : cliquez sur « Calculer » d'abord." };
  }
  if (!payload?.drive || !Array.isArray(payload.positions) || payload.positions.length === 0) {
    return { ok: false, error: "Trajet non calculé : cliquez sur « Calculer » d'abord." };
  }

  const carId = parseInt(parsed.data.car_id, 10);
  const d = payload.drive;

  let createdId: number;
  try {
    createdId = await prisma.$transaction(async (tx) => {
      const drive = await tx.drives.create({
        data: {
          car_id: carId,
          start_date: new Date(parsed.data.start_date),
          end_date: new Date(d.end_date),
          distance: d.distance,
          duration_min: d.duration_min,
          start_km: d.start_km,
          end_km: d.end_km,
          start_ideal_range_km: decOrNull(d.start_ideal_range_km),
          end_ideal_range_km: decOrNull(d.end_ideal_range_km),
          start_rated_range_km: decOrNull(d.start_rated_range_km),
          end_rated_range_km: decOrNull(d.end_rated_range_km),
          outside_temp_avg: decOrNull(d.outside_temp_avg),
          inside_temp_avg: decOrNull(d.inside_temp_avg),
          speed_max: d.speed_max,
          start_address_id: intOrNull(parsed.data.start_address_id),
          end_address_id: intOrNull(parsed.data.end_address_id),
          start_geofence_id: intOrNull(parsed.data.start_geofence_id),
          end_geofence_id: intOrNull(parsed.data.end_geofence_id),
        },
        select: { id: true },
      });

      await tx.positions.createMany({
        data: payload.positions.map((p) => ({
          car_id: carId,
          drive_id: drive.id,
          date: new Date(p.date),
          latitude: new Prisma.Decimal(p.latitude),
          longitude: new Prisma.Decimal(p.longitude),
          speed: p.speed,
          odometer: p.odometer,
          battery_level: p.battery_level,
          ideal_battery_range_km: decOrNull(p.ideal_battery_range_km),
          rated_battery_range_km: decOrNull(p.rated_battery_range_km),
          outside_temp: decOrNull(p.outside_temp),
          inside_temp: decOrNull(p.inside_temp),
        })),
      });

      const first = await tx.positions.findFirst({
        where: { drive_id: drive.id },
        orderBy: { date: "asc" },
        select: { id: true },
      });
      const lastPos = await tx.positions.findFirst({
        where: { drive_id: drive.id },
        orderBy: { date: "desc" },
        select: { id: true },
      });
      await tx.drives.update({
        where: { id: drive.id },
        data: { start_position_id: first?.id ?? null, end_position_id: lastPos?.id ?? null },
      });

      return drive.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, error: "Référence introuvable (véhicule, adresse ou géofence)." };
    }
    logger.error({ event: "drives.create_with_positions.error", err: String(e) }, "create failed");
    return { ok: false, error: "Une erreur est survenue lors de l'enregistrement." };
  }

  logger.info(
    {
      event: "drives.create_with_positions",
      user: session.userId,
      id: createdId,
      positions: payload.positions.length,
    },
    "drives.create_with_positions",
  );

  revalidatePath("/drives");
  redirect(`/drives/${createdId}`);
}
