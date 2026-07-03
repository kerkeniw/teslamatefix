import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PreferredRange } from "@/lib/units";

/**
 * Listing des trajets calqué sur le panel « Drive » du dashboard Grafana de
 * TeslaMate. Porté en SQL brut car deux critères filtrent des expressions
 * calculées (vitesse moyenne, libellé d'adresse coalescé) impossibles à exprimer
 * via prisma.findMany tout en gardant un COUNT exact. Tout est métrique côté SQL ;
 * la conversion d'unités se fait en amont (seuils) et à l'affichage (cf. units.ts).
 */

export type DriveListRow = {
  id: number;
  start_date: string;
  end_date: string | null;
  car_id: number;
  // Libellés coalescés (géofence sinon adresse)
  start_address: string | null;
  end_address: string | null;
  // Colonnes Grafana
  duration_min: number | null;
  distance: number | null;
  start_battery_level: number | null;
  end_battery_level: number | null;
  outside_temp_avg: number | null;
  avg_speed: number | null;
  speed_max: number | null;
  power_max: number | null;
  has_reduced_range: boolean;
  // Pour efficacité / consommation (calcul en JS selon le mode)
  car_efficiency: number | null;
  range_diff: number | null;
  ascent: number | null;
  descent: number | null;
  // Colonnes brutes « non interprétées »
  start_km: number | null;
  end_km: number | null;
  inside_temp_avg: number | null;
  power_min: number | null;
  start_ideal_range_km: number | null;
  end_ideal_range_km: number | null;
  start_rated_range_km: number | null;
  end_rated_range_km: number | null;
  start_address_id: number | null;
  end_address_id: number | null;
  start_geofence_id: number | null;
  end_geofence_id: number | null;
  start_position_id: number | null;
  end_position_id: number | null;
};

export type ListDrivesOpts = {
  carId: number;
  from: Date | null;
  to: Date | null;
  openOnly: boolean;
  minDistKm: number | null;
  minSpeedKmh: number | null;
  geofenceIds: number[];
  location: string | null;
  preferredRange: PreferredRange;
  page: number;
  pageSize: number;
};

// Ligne brute renvoyée par $queryRaw (dates en Date, décimaux castés en float8).
type RawRow = Omit<DriveListRow, "start_date" | "end_date" | "has_reduced_range"> & {
  drive_id: number;
  start_date: Date;
  end_date: Date | null;
};

export async function listDrives(
  opts: ListDrivesOpts,
): Promise<{ rows: DriveListRow[]; total: number }> {
  const {
    carId, from, to, openOnly, minDistKm, minSpeedKmh,
    geofenceIds, location, preferredRange, page, pageSize,
  } = opts;

  // Whitelist stricte → interpolation de nom de colonne sûre.
  const rangePrefix = preferredRange === "ideal" ? "ideal" : "rated";
  const startRangeCol = Prisma.raw(`d.start_${rangePrefix}_range_km`);
  const endRangeCol = Prisma.raw(`d.end_${rangePrefix}_range_km`);

  // Filtres du CTE interne (colonnes brutes).
  const inner: Prisma.Sql[] = [Prisma.sql`d.car_id = ${carId}`];
  if (from) inner.push(Prisma.sql`d.start_date >= ${from}`);
  if (to) inner.push(Prisma.sql`d.start_date <= ${to}`);
  if (openOnly) inner.push(Prisma.sql`d.end_date IS NULL`);
  if (minDistKm != null) inner.push(Prisma.sql`d.distance >= ${minDistKm}`);
  const innerWhere = Prisma.join(inner, " AND ");

  // Filtres externes (colonnes calculées).
  const outer: Prisma.Sql[] = [];
  if (minSpeedKmh != null && minSpeedKmh > 0) {
    outer.push(Prisma.sql`COALESCE(avg_speed, 0) >= ${minSpeedKmh}`);
  }
  if (geofenceIds.length > 0) {
    outer.push(
      Prisma.sql`(start_geofence_id IN (${Prisma.join(geofenceIds)}) OR end_geofence_id IN (${Prisma.join(geofenceIds)}))`,
    );
  }
  if (location) {
    const like = `%${location}%`;
    outer.push(Prisma.sql`(start_address ILIKE ${like} OR end_address ILIKE ${like})`);
  }
  const outerWhere = outer.length
    ? Prisma.sql`WHERE ${Prisma.join(outer, " AND ")}`
    : Prisma.empty;

  const cte = Prisma.sql`
    WITH data AS (
      SELECT
        d.id AS drive_id,
        d.start_date, d.end_date, d.car_id,
        d.start_km, d.end_km, d.distance, d.duration_min,
        d.start_ideal_range_km::float8 AS start_ideal_range_km,
        d.end_ideal_range_km::float8 AS end_ideal_range_km,
        d.start_rated_range_km::float8 AS start_rated_range_km,
        d.end_rated_range_km::float8 AS end_rated_range_km,
        d.outside_temp_avg::float8 AS outside_temp_avg,
        d.inside_temp_avg::float8 AS inside_temp_avg,
        d.speed_max, d.power_max, d.power_min, d.ascent, d.descent,
        d.start_address_id, d.end_address_id, d.start_geofence_id, d.end_geofence_id,
        d.start_position_id, d.end_position_id,
        COALESCE(sg.name, CONCAT_WS(', ', COALESCE(sa.name, NULLIF(CONCAT_WS(' ', sa.road, sa.house_number), '')), sa.city)) AS start_address,
        COALESCE(eg.name, CONCAT_WS(', ', COALESCE(ea.name, NULLIF(CONCAT_WS(' ', ea.road, ea.house_number), '')), ea.city)) AS end_address,
        sp.battery_level AS start_battery_level,
        ep.battery_level AS end_battery_level,
        c.efficiency::float8 AS car_efficiency,
        (${startRangeCol} - ${endRangeCol})::float8 AS range_diff,
        (d.distance / COALESCE(NULLIF(d.duration_min, 0) * 60, EXTRACT(epoch FROM d.end_date - d.start_date)) * 3600)::float8 AS avg_speed
      FROM drives d
      LEFT JOIN addresses sa ON d.start_address_id = sa.id
      LEFT JOIN addresses ea ON d.end_address_id = ea.id
      LEFT JOIN positions sp ON d.start_position_id = sp.id
      LEFT JOIN positions ep ON d.end_position_id = ep.id
      LEFT JOIN geofences sg ON d.start_geofence_id = sg.id
      LEFT JOIN geofences eg ON d.end_geofence_id = eg.id
      LEFT JOIN cars c ON c.id = d.car_id
      WHERE ${innerWhere}
    )
  `;

  const [rawRows, countRes] = await Promise.all([
    prisma.$queryRaw<RawRow[]>(Prisma.sql`
      ${cte}
      SELECT * FROM data
      ${outerWhere}
      ORDER BY drive_id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `),
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      ${cte}
      SELECT count(*)::int AS count FROM data
      ${outerWhere}
    `),
  ]);

  const total = Number(countRes[0]?.count ?? 0);

  // ❄ autonomie réduite : calculé uniquement pour les trajets de la page.
  const ids = rawRows.map((r) => r.drive_id);
  let reduced = new Set<number>();
  if (ids.length > 0) {
    const rr = await prisma.$queryRaw<{ drive_id: number }[]>(Prisma.sql`
      SELECT p.drive_id
      FROM positions p
      WHERE p.drive_id IN (${Prisma.join(ids)}) AND p.ideal_battery_range_km IS NOT NULL
      GROUP BY p.drive_id
      HAVING sum(CASE WHEN p.battery_level - p.usable_battery_level > 0 THEN 1 ELSE 0 END)::numeric / count(*) > 0.25
    `);
    reduced = new Set(rr.map((x) => x.drive_id));
  }

  const rows: DriveListRow[] = rawRows.map((r) => {
    const { drive_id, start_date, end_date, ...rest } = r;
    return {
      ...rest,
      id: drive_id,
      start_date: start_date.toISOString(),
      end_date: end_date ? end_date.toISOString() : null,
      has_reduced_range: reduced.has(drive_id),
    };
  });

  return { rows, total };
}
