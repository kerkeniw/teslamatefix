// Échantillonne 10 drives + 10 charging_processes aléatoires et sérialise leurs
// colonnes brutes en `audit/{drives,charges}.db.json`. Sert d'entrée à
// `scripts/audit-capture.mjs` (Playwright) et `scripts/audit-compare.mjs`.
//
// Usage : node --env-file=.env scripts/audit-pick.mjs
//
// `pg` directement : depuis Prisma 7, le client généré (TypeScript, dans
// `src/generated`) n'est pas importable depuis un script Node.
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "..", "audit");
mkdirSync(OUT_DIR, { recursive: true });

// TeslaMate stocke de l'UTC en `timestamp without time zone` : sans ce parseur,
// `pg` l'interpréterait en heure locale.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (s) => new Date(`${s.replace(" ", "T")}Z`));

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

// Sérialisation safe pour traverser un JSON.stringify : BigInt / Date.
// (`pg` renvoie déjà les numeric en chaîne, comme le `toString()` d'un Decimal.)
function replacer(_key, value) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function pickIds(table, n = 10) {
  // ORDER BY RANDOM() : suffisant à l'échelle des entités (drives 1.6k,
  // charging_processes 161). À éviter sur positions (4.4M lignes) — hors-périmètre.
  const { rows } = await client.query(
    `SELECT id FROM public.${table} ORDER BY RANDOM() LIMIT $1`,
    [n],
  );
  return rows.map((r) => Number(r.id)).sort((a, b) => a - b);
}

async function byIds(sql, ids) {
  const list = [...ids].filter((x) => x != null);
  if (list.length === 0) return [];
  const { rows } = await client.query(sql, [list]);
  return rows;
}

async function main() {
  await client.connect();

  const driveIds = await pickIds("drives", 10);
  const chargeIds = await pickIds("charging_processes", 10);

  const drives = await byIds(
    "SELECT * FROM public.drives WHERE id = ANY($1::int[]) ORDER BY id",
    driveIds,
  );
  const charges = await byIds(
    "SELECT * FROM public.charging_processes WHERE id = ANY($1::int[]) ORDER BY id",
    chargeIds,
  );

  // Récupère aussi les labels FK référencés (pour comparer côté combo).
  const addressIds = new Set();
  const geofenceIds = new Set();
  const positionIds = new Set();
  for (const d of drives) {
    for (const k of ["start_address_id", "end_address_id"]) addressIds.add(d[k]);
    for (const k of ["start_geofence_id", "end_geofence_id"]) geofenceIds.add(d[k]);
    for (const k of ["start_position_id", "end_position_id"]) positionIds.add(d[k]);
  }
  for (const c of charges) {
    if (c.address_id != null) addressIds.add(c.address_id);
    if (c.geofence_id != null) geofenceIds.add(c.geofence_id);
    if (c.position_id != null) positionIds.add(c.position_id);
  }

  const addresses = await byIds(
    "SELECT id, display_name, city, road, country FROM public.addresses WHERE id = ANY($1::int[])",
    addressIds,
  );
  const geofences = await byIds(
    "SELECT id, name FROM public.geofences WHERE id = ANY($1::int[])",
    geofenceIds,
  );
  const positions = await byIds(
    "SELECT id, date, latitude, longitude FROM public.positions WHERE id = ANY($1::int[])",
    positionIds,
  );

  writeFileSync(
    resolve(OUT_DIR, "drives.db.json"),
    JSON.stringify({ ids: driveIds, rows: drives }, replacer, 2),
  );
  writeFileSync(
    resolve(OUT_DIR, "charges.db.json"),
    JSON.stringify({ ids: chargeIds, rows: charges }, replacer, 2),
  );
  writeFileSync(
    resolve(OUT_DIR, "lookups.db.json"),
    JSON.stringify({ addresses, geofences, positions }, replacer, 2),
  );

  console.log("Drives :", driveIds.join(", "));
  console.log("Charges:", chargeIds.join(", "));
  console.log("→", OUT_DIR);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
