import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { TeslaChargeSession } from "./charging-csv";
import {
  compareCharges,
  importPeriods,
  DEFAULT_COMPARE_OPTIONS,
  type CompareReport,
  type TmChargeSession,
} from "./compare";

type RawTm = {
  id: number;
  car_id: number;
  start_date: Date;
  effective_end: Date;
  open: boolean;
  charge_energy_added: number | null;
};

/**
 * Charge les sessions TeslaMate couvrant la période de l'export puis compare.
 * Fin effective = end_date, sinon dernier tick (session restée ouverte), sinon
 * début — même règle que la détection de chevauchement de la v0.7.0.
 */
export async function buildChargeReport(sessions: TeslaChargeSession[]): Promise<CompareReport> {
  const cars = await prisma.cars.findMany({ select: { id: true, vin: true } });
  const carIdByVin = new Map(
    cars.filter((c) => c.vin).map((c) => [c.vin as string, c.id]),
  );

  const tolMs = DEFAULT_COMPARE_OPTIONS.joinToleranceMin * 60_000;
  const periods = importPeriods(sessions, carIdByVin);
  const tm: TmChargeSession[] = [];
  for (const p of periods) {
    const from = new Date(Date.parse(p.from) - tolMs);
    const to = new Date(Date.parse(p.to) + tolMs);
    const rows = await prisma.$queryRaw<RawTm[]>(Prisma.sql`
      SELECT cp.id, cp.car_id, cp.start_date,
             COALESCE(cp.end_date, last.date, cp.start_date) AS effective_end,
             cp.end_date IS NULL AS open,
             cp.charge_energy_added::float8 AS charge_energy_added
      FROM charging_processes cp
      LEFT JOIN LATERAL (
        SELECT max(c.date) AS date FROM charges c WHERE c.charging_process_id = cp.id
      ) last ON cp.end_date IS NULL
      WHERE cp.car_id = ${p.carId} AND cp.start_date BETWEEN ${from} AND ${to}
    `);
    for (const r of rows) {
      tm.push({
        id: r.id,
        carId: r.car_id,
        start: r.start_date.toISOString(),
        end: r.effective_end.toISOString(),
        open: r.open,
        energyAddedKwh: r.charge_energy_added,
      });
    }
  }

  return compareCharges(sessions, tm, carIdByVin);
}
