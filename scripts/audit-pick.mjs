// Échantillonne 10 drives + 10 charging_processes aléatoires et sérialise leurs
// colonnes brutes en `audit/{drives,charges}.db.json`. Sert d'entrée à
// `scripts/audit-capture.mjs` (Playwright) et `scripts/audit-compare.mjs`.
//
// Usage : node --env-file=.env scripts/audit-pick.mjs
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "..", "audit");
mkdirSync(OUT_DIR, { recursive: true });

const prisma = new PrismaClient();

// Sérialisation safe pour traverser un JSON.stringify : Decimal / BigInt / Date.
function replacer(_key, value) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  // Prisma Decimal a une méthode toString — détecté par tag interne.
  if (value && typeof value === "object" && "toFixed" in value && "s" in value && "d" in value) {
    return value.toString();
  }
  return value;
}

async function pickIds(table, n = 10) {
  // ORDER BY RANDOM() : suffisant à l'échelle des entités (drives 1.6k,
  // charging_processes 161). À éviter sur positions (4.4M lignes) — hors-périmètre.
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id FROM public.${table} ORDER BY RANDOM() LIMIT ${n}`,
  );
  return rows.map((r) => Number(r.id)).sort((a, b) => a - b);
}

async function main() {
  const driveIds = await pickIds("drives", 10);
  const chargeIds = await pickIds("charging_processes", 10);

  const drives = await prisma.drives.findMany({
    where: { id: { in: driveIds } },
    orderBy: { id: "asc" },
  });
  const charges = await prisma.charging_processes.findMany({
    where: { id: { in: chargeIds } },
    orderBy: { id: "asc" },
  });

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

  const addresses = await prisma.addresses.findMany({
    where: { id: { in: [...addressIds].filter((x) => x != null) } },
    select: { id: true, display_name: true, city: true, road: true, country: true },
  });
  const geofences = await prisma.geofences.findMany({
    where: { id: { in: [...geofenceIds].filter((x) => x != null) } },
    select: { id: true, name: true },
  });
  const positions = await prisma.positions.findMany({
    where: { id: { in: [...positionIds].filter((x) => x != null) } },
    select: { id: true, date: true, latitude: true, longitude: true },
  });

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

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
