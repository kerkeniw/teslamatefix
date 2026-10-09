// Smoke test : compte les lignes des principales tables TeslaMate.
// Usage : `node --env-file=.env scripts/check-db.mjs`
//
// Depuis Prisma 7, le client est généré en TypeScript dans `src/generated` et
// n'est plus importable depuis un script Node : on interroge la base avec `pg`,
// le pilote qu'utilise l'application (adaptateur `@prisma/adapter-pg`).
import pg from "pg";

const TABLES = [
  "cars",
  "drives",
  "charging_processes",
  "positions",
  "charges",
  "addresses",
  "geofences",
  "states",
  "updates",
  "settings",
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const counts = {};
  for (const table of TABLES) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
    counts[table] = rows[0].n;
  }
  console.log(counts);
} finally {
  await client.end();
}
