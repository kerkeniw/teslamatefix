// Exploration : sessions de charge chez Carrefour (V/A/phases/puissance).
// Usage : node --env-file=.env scripts/query-carrefour.mjs
// (`pg` directement : le client Prisma 7 généré n'est pas importable d'un script Node.)
import pg from "pg";

// TeslaMate stocke de l'UTC en `timestamp without time zone`.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (s) => new Date(`${s.replace(" ", "T")}Z`));

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function show(title, sql) {
  console.log(`\n=== ${title} ===`);
  const { rows } = await client.query(sql);
  console.log(JSON.stringify(rows, null, 2));
}

async function main() {
  await client.connect();

  await show(
    "4a. Sessions chez Carrefour",
    `SELECT cp.id, cp.start_date, cp.end_date, cp.charge_energy_added, cp.charge_energy_used,
            g.name AS geofence_name
     FROM "public"."charging_processes" cp
     LEFT JOIN "public"."geofences" g ON g.id = cp.geofence_id
     WHERE g.name ILIKE '%carrefour%'
     ORDER BY cp.start_date DESC
     LIMIT 10`,
  );

  await show(
    "4b. Distribution V/A/phases/power (Carrefour)",
    `SELECT cp.id AS process_id,
            MAX(c.charger_voltage)        AS v_max,
            MAX(c.charger_actual_current) AS a_max,
            MAX(c.charger_phases)         AS phases,
            MAX(c.charger_power)          AS power_max,
            BOOL_OR(c.fast_charger_present) AS any_fast
     FROM "public"."charging_processes" cp
     JOIN "public"."geofences" g ON g.id = cp.geofence_id
     JOIN "public"."charges" c ON c.charging_process_id = cp.id
     WHERE g.name ILIKE '%carrefour%'
     GROUP BY cp.id
     ORDER BY cp.id DESC
     LIMIT 10`,
  );

  await show(
    "4c. Ticks stabilisés (dernière session Carrefour)",
    `WITH s AS (
       SELECT cp.id FROM "public"."charging_processes" cp
       JOIN "public"."geofences" g ON g.id = cp.geofence_id
       WHERE g.name ILIKE '%carrefour%'
       ORDER BY cp.start_date DESC LIMIT 1
     )
     SELECT c.date, c.battery_level, c.charger_voltage, c.charger_actual_current,
            c.charger_phases, c.charger_power, c.fast_charger_present
     FROM "public"."charges" c JOIN s ON c.charging_process_id = s.id
     ORDER BY c.date ASC LIMIT 20`,
  );

  await show(
    "4d. Sessions DC (fast charger)",
    `SELECT cp.id, g.name,
            MAX(c.charger_voltage) as v_max, MAX(c.charger_actual_current) as a_max,
            MAX(c.charger_phases) as phases, MAX(c.charger_power) as power_max,
            BOOL_OR(c.fast_charger_present) as any_fast
     FROM "public"."charging_processes" cp
     LEFT JOIN "public"."geofences" g ON g.id = cp.geofence_id
     JOIN "public"."charges" c ON c.charging_process_id = cp.id
     WHERE c.fast_charger_present = true
     GROUP BY cp.id, g.name
     ORDER BY cp.id DESC LIMIT 5`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
