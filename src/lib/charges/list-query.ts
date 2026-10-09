import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { PreferredRange } from "@/lib/units";

/**
 * Listing des sessions de charge calqué sur le dashboard Grafana « Charges » de
 * TeslaMate. SQL brut (même découpage que `drives/list-query.ts`) : plusieurs
 * filtres portent sur des expressions calculées (efficience, type AC/DC issu des
 * ticks, libellé coalescé) tout en gardant un COUNT exact et un récapitulatif de
 * période. Tout est métrique côté SQL ; conversions à l'affichage (units.ts).
 */

export type ChargeType = "AC" | "DC";

export type ChargeListRow = {
  id: number;
  start_date: string;
  end_date: string | null;
  car_id: number;
  place: string | null;
  // Type déduit des ticks (mode des phases, comme Grafana) ; null sans tick.
  charge_type: ChargeType | null;
  duration_min: number | null;
  cost: number | null;
  charge_energy_added: number | null;
  charge_energy_used: number | null;
  outside_temp_avg: number | null;
  start_battery_level: number | null;
  end_battery_level: number | null;
  range_added_km: number | null;
  odometer_km: number | null;
  // Colonnes brutes
  start_ideal_range_km: number | null;
  end_ideal_range_km: number | null;
  start_rated_range_km: number | null;
  end_rated_range_km: number | null;
  address_id: number | null;
  geofence_id: number | null;
  position_id: number;
};

export type ChargeListSummary = {
  count: number;
  energy_added: number | null;
  energy_used: number | null;
  cost: number | null;
  avg_duration_min: number | null;
};

export type ListChargesOpts = {
  carId: number;
  from: Date | null;
  to: Date | null;
  openOnly: boolean;
  geofenceIds: number[];
  location: string | null;
  types: ChargeType[];
  minCost: number | null;
  minDurationMin: number | null;
  minAddedKwh: number | null;
  minUsedKwh: number | null;
  /** Efficience maximale en % (added / used × 100). Exclut les sessions sans `used`. */
  maxEfficiencyPct: number | null;
  preferredRange: PreferredRange;
  page: number;
  pageSize: number;
};

type RawRow = Omit<ChargeListRow, "id" | "start_date" | "end_date"> & {
  process_id: number;
  start_date: Date;
  end_date: Date | null;
};

type RawSummary = {
  count: number;
  energy_added: number | null;
  energy_used: number | null;
  cost: number | null;
  avg_duration_min: number | null;
};

export async function listCharges(
  opts: ListChargesOpts,
): Promise<{ rows: ChargeListRow[]; total: number; summary: ChargeListSummary }> {
  const {
    carId, from, to, openOnly, geofenceIds, location, types, minCost,
    minDurationMin, minAddedKwh, minUsedKwh, maxEfficiencyPct,
    preferredRange, page, pageSize,
  } = opts;

  // Whitelist stricte → interpolation de nom de colonne sûre.
  const rangePrefix = preferredRange === "ideal" ? "ideal" : "rated";
  const startRangeCol = Prisma.raw(`cp.start_${rangePrefix}_range_km`);
  const endRangeCol = Prisma.raw(`cp.end_${rangePrefix}_range_km`);

  // Filtres du CTE interne (colonnes brutes).
  const inner: Prisma.Sql[] = [Prisma.sql`cp.car_id = ${carId}`];
  if (from) inner.push(Prisma.sql`cp.start_date >= ${from}`);
  if (to) inner.push(Prisma.sql`cp.start_date <= ${to}`);
  if (openOnly) inner.push(Prisma.sql`cp.end_date IS NULL`);
  if (geofenceIds.length > 0) {
    inner.push(Prisma.sql`cp.geofence_id IN (${Prisma.join(geofenceIds)})`);
  }
  if (minCost != null) inner.push(Prisma.sql`cp.cost >= ${minCost}`);
  if (minDurationMin != null) inner.push(Prisma.sql`cp.duration_min >= ${minDurationMin}`);
  if (minAddedKwh != null) inner.push(Prisma.sql`cp.charge_energy_added >= ${minAddedKwh}`);
  if (minUsedKwh != null) inner.push(Prisma.sql`cp.charge_energy_used >= ${minUsedKwh}`);
  if (maxEfficiencyPct != null) {
    inner.push(
      Prisma.sql`cp.charge_energy_used > 0 AND cp.charge_energy_added * 100 <= ${maxEfficiencyPct} * cp.charge_energy_used`,
    );
  }
  const innerWhere = Prisma.join(inner, " AND ");

  // Filtres externes (colonnes calculées).
  const outer: Prisma.Sql[] = [];
  if (location) outer.push(Prisma.sql`place ILIKE ${`%${location}%`}`);
  if (types.length === 1) outer.push(Prisma.sql`charge_type = ${types[0]}`);
  const outerWhere = outer.length
    ? Prisma.sql`WHERE ${Prisma.join(outer, " AND ")}`
    : Prisma.empty;

  const cte = Prisma.sql`
    WITH data AS (
      SELECT
        cp.id AS process_id,
        cp.start_date, cp.end_date, cp.car_id,
        cp.duration_min,
        cp.cost::float8 AS cost,
        cp.charge_energy_added::float8 AS charge_energy_added,
        cp.charge_energy_used::float8 AS charge_energy_used,
        cp.outside_temp_avg::float8 AS outside_temp_avg,
        cp.start_battery_level, cp.end_battery_level,
        cp.start_ideal_range_km::float8 AS start_ideal_range_km,
        cp.end_ideal_range_km::float8 AS end_ideal_range_km,
        cp.start_rated_range_km::float8 AS start_rated_range_km,
        cp.end_rated_range_km::float8 AS end_rated_range_km,
        (${endRangeCol} - ${startRangeCol})::float8 AS range_added_km,
        cp.address_id, cp.geofence_id, cp.position_id,
        p.odometer::float8 AS odometer_km,
        COALESCE(g.name, CONCAT_WS(', ', COALESCE(a.name, NULLIF(CONCAT_WS(' ', a.road, a.house_number), '')), a.city)) AS place,
        CASE
          WHEN t.tick_count = 0 THEN NULL
          WHEN NULLIF(t.phases_mode, 0) IS NULL THEN 'DC'
          ELSE 'AC'
        END AS charge_type
      FROM charging_processes cp
      LEFT JOIN addresses a ON a.id = cp.address_id
      LEFT JOIN geofences g ON g.id = cp.geofence_id
      LEFT JOIN positions p ON p.id = cp.position_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS tick_count,
               mode() WITHIN GROUP (ORDER BY c.charger_phases) AS phases_mode
        FROM charges c
        WHERE c.charging_process_id = cp.id
      ) t ON true
      WHERE ${innerWhere}
    )
  `;

  const [rawRows, summaryRes] = await Promise.all([
    prisma.$queryRaw<RawRow[]>(Prisma.sql`
      ${cte}
      SELECT * FROM data
      ${outerWhere}
      ORDER BY start_date DESC, process_id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `),
    prisma.$queryRaw<RawSummary[]>(Prisma.sql`
      ${cte}
      SELECT
        count(*)::int AS count,
        sum(charge_energy_added)::float8 AS energy_added,
        sum(charge_energy_used)::float8 AS energy_used,
        sum(cost)::float8 AS cost,
        avg(duration_min)::float8 AS avg_duration_min
      FROM data
      ${outerWhere}
    `),
  ]);

  const s = summaryRes[0];
  const summary: ChargeListSummary = {
    count: Number(s?.count ?? 0),
    energy_added: s?.energy_added ?? null,
    energy_used: s?.energy_used ?? null,
    cost: s?.cost ?? null,
    avg_duration_min: s?.avg_duration_min ?? null,
  };

  const rows: ChargeListRow[] = rawRows.map((r) => {
    const { process_id, start_date, end_date, ...rest } = r;
    return {
      ...rest,
      id: process_id,
      start_date: start_date.toISOString(),
      end_date: end_date ? end_date.toISOString() : null,
    };
  });

  return { rows, total: summary.count, summary };
}
