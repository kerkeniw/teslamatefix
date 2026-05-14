import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function findOverlappingSession(
  carId: number,
  startDate: Date,
  endDate: Date | null,
  excludeId: number | null = null,
): Promise<{ id: number; start_date: Date; end_date: Date | null } | null> {
  const idFilter = excludeId == null ? {} : { id: { not: excludeId } };
  const range: Prisma.charging_processesWhereInput =
    endDate == null
      ? {
          OR: [
            { end_date: null },
            { end_date: { gte: startDate } },
          ],
        }
      : {
          start_date: { lt: endDate },
          OR: [
            { end_date: null },
            { end_date: { gt: startDate } },
          ],
        };

  return prisma.charging_processes.findFirst({
    where: { car_id: carId, ...idFilter, ...range },
    select: { id: true, start_date: true, end_date: true },
    orderBy: { start_date: "asc" },
  });
}

export type ProcessRecalc = {
  start_date: Date | null;
  end_date: Date | null;
  duration_min: number | null;
  charge_energy_added: number | null;
  start_battery_level: number | null;
  end_battery_level: number | null;
};

export async function recalcFromTicks(
  processId: number,
): Promise<{ before: ProcessRecalc; after: ProcessRecalc }> {
  const proc = await prisma.charging_processes.findUnique({
    where: { id: processId },
    select: {
      start_date: true,
      end_date: true,
      duration_min: true,
      charge_energy_added: true,
      start_battery_level: true,
      end_battery_level: true,
    },
  });
  if (!proc) {
    throw new Error(`charging_process ${processId} not found`);
  }

  const before: ProcessRecalc = {
    start_date: proc.start_date,
    end_date: proc.end_date,
    duration_min: proc.duration_min ?? null,
    charge_energy_added:
      proc.charge_energy_added != null ? Number(proc.charge_energy_added) : null,
    start_battery_level: proc.start_battery_level ?? null,
    end_battery_level: proc.end_battery_level ?? null,
  };

  // Agrégats des ticks. `charge_energy_added` est cumulatif côté TeslaMate :
  // le dernier tick contient le total, donc on prend le MAX. battery_level
  // peut osciller pendant la session ; on prend MIN/MAX pour border l'enveloppe
  // start/end. La durée est reconstruite à partir de l'enveloppe temporelle.
  const agg = await prisma.charges.aggregate({
    where: { charging_process_id: processId },
    _min: { date: true, battery_level: true },
    _max: { date: true, battery_level: true, charge_energy_added: true },
    _count: { _all: true },
  });

  if (agg._count._all === 0) {
    return { before, after: { ...before } };
  }

  // Pour start/end battery_level on prend le tick chronologique de bord — un
  // SOC qui descend en début de session (charge fictive perdue) ne doit pas
  // être confondu avec le start.
  const [firstTick, lastTick] = await Promise.all([
    prisma.charges.findFirst({
      where: { charging_process_id: processId },
      orderBy: { date: "asc" },
      select: { battery_level: true },
    }),
    prisma.charges.findFirst({
      where: { charging_process_id: processId },
      orderBy: { date: "desc" },
      select: { battery_level: true },
    }),
  ]);

  const startDate = agg._min.date;
  const endDate = agg._max.date;
  const durationMin =
    startDate && endDate
      ? Math.round((endDate.getTime() - startDate.getTime()) / 60000)
      : null;

  const after: ProcessRecalc = {
    start_date: startDate ?? before.start_date,
    end_date: endDate ?? before.end_date,
    duration_min: durationMin,
    charge_energy_added:
      agg._max.charge_energy_added != null
        ? Number(agg._max.charge_energy_added)
        : null,
    start_battery_level: firstTick?.battery_level ?? null,
    end_battery_level: lastTick?.battery_level ?? null,
  };

  return { before, after };
}

export async function applyRecalc(
  processId: number,
  recalc: Partial<ProcessRecalc>,
): Promise<void> {
  const data: Prisma.charging_processesUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(recalc, "start_date")) {
    data.start_date = recalc.start_date ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "end_date")) {
    data.end_date = recalc.end_date;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "duration_min")) {
    data.duration_min = recalc.duration_min;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "charge_energy_added")) {
    data.charge_energy_added =
      recalc.charge_energy_added == null
        ? null
        : new Prisma.Decimal(recalc.charge_energy_added);
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "start_battery_level")) {
    data.start_battery_level = recalc.start_battery_level;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "end_battery_level")) {
    data.end_battery_level = recalc.end_battery_level;
  }
  await prisma.charging_processes.update({ where: { id: processId }, data });
}
