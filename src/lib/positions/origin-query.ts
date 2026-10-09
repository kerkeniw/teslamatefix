import { prisma } from "@/lib/db";
import { logger, safeErr } from "@/lib/logger";
import {
  getTeslaMateApiCapabilities,
  invalidateTeslaMateApiCapabilities,
} from "@/lib/teslamateapi/capabilities";
import { isPositionOrigin, originFromColumns, type OriginMode, type PositionOrigin } from "./origin";

export type OriginInfo = { origin: PositionOrigin; d13Kind: string | null };

/**
 * Origine des positions données. Avec les capacités TeslaMateAPI
 * `reconstructions` + `fill`, applique la requête de classement de
 * docs/ORIGINE_POSITIONS.md restreinte à ces ids ; sinon (ou en cas d'échec,
 * p. ex. colonne renommée côté TeslaMateAPI) se rabat sur la signature des
 * colonnes. Lecture seule, jamais d'exception.
 */
export async function getPositionOrigins(
  positions: {
    id: number;
    ideal_battery_range_km: unknown;
    rated_battery_range_km: unknown;
  }[],
): Promise<{ mode: OriginMode; byId: Map<number, OriginInfo> }> {
  const byId = new Map<number, OriginInfo>();
  for (const p of positions) byId.set(p.id, { origin: originFromColumns(p), d13Kind: null });
  if (positions.length === 0) return { mode: "columns", byId };

  const caps = await getTeslaMateApiCapabilities();
  if (!caps.reconstructions || !caps.fill) return { mode: "columns", byId };

  const ids = positions.map((p) => p.id);
  try {
    const rows = await prisma.$queryRaw<
      { id: number; d13_kind: string | null; autonomies: boolean | null }[]
    >`
      WITH ids AS (SELECT unnest(${ids}::int[]) AS id),
      creees AS (
        SELECT DISTINCT ON (pid) pid, r.kind::text AS kind
        FROM telemetry.reconstructions r, unnest(r.created_position_ids) AS pid
        WHERE r.undone_at IS NULL AND pid IN (SELECT id FROM ids)
        ORDER BY pid, r.id DESC
      ),
      remplies AS (
        SELECT f.position_id, bool_or('ideal_battery_range_km' = ANY (f.cols)) AS autonomies
        FROM telemetry.filled_positions f
        JOIN telemetry.reconstructions r ON r.id = f.reconstruction_id AND r.undone_at IS NULL
        WHERE f.position_id IN (SELECT id FROM ids)
        GROUP BY f.position_id
      )
      SELECT ids.id, c.kind AS d13_kind, rf.autonomies
      FROM ids
      LEFT JOIN creees c ON c.pid = ids.id
      LEFT JOIN remplies rf ON rf.position_id = ids.id
      WHERE c.pid IS NOT NULL OR rf.autonomies
    `;
    for (const r of rows) {
      const id = Number(r.id);
      const origin: PositionOrigin = r.d13_kind != null ? "d13" : "flux_complete";
      if (isPositionOrigin(origin)) byId.set(id, { origin, d13Kind: r.d13_kind });
    }
    return { mode: "full", byId };
  } catch (e) {
    logger.warn(
      { event: "positions.origin.query_error", err: safeErr(e) },
      "position origin query failed, falling back to column signature",
    );
    invalidateTeslaMateApiCapabilities();
    return { mode: "columns", byId };
  }
}
