import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== 4a. Sessions chez Carrefour ===');
  const sessions = await prisma.$queryRaw`
    SELECT cp.id, cp.start_date, cp.end_date, cp.charge_energy_added, cp.charge_energy_used,
           g.name AS geofence_name
    FROM "public"."charging_processes" cp
    LEFT JOIN "public"."geofences" g ON g.id = cp.geofence_id
    WHERE g.name ILIKE '%carrefour%'
    ORDER BY cp.start_date DESC
    LIMIT 10
  `;
  console.log(JSON.stringify(sessions, null, 2));

  console.log('\n=== 4b. Distribution V/A/phases/power (Carrefour) ===');
  const stats = await prisma.$queryRaw`
    SELECT cp.id AS process_id,
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
    LIMIT 10
  `;
  console.log(JSON.stringify(stats, null, 2));

  console.log('\n=== 4c. Ticks stabilisés (dernière session Carrefour) ===');
  const ticks = await prisma.$queryRaw`
    WITH s AS (
      SELECT cp.id FROM "public"."charging_processes" cp
      JOIN "public"."geofences" g ON g.id = cp.geofence_id
      WHERE g.name ILIKE '%carrefour%'
      ORDER BY cp.start_date DESC LIMIT 1
    )
    SELECT c.date, c.battery_level, c.charger_voltage, c.charger_actual_current,
           c.charger_phases, c.charger_power, c.fast_charger_present
    FROM "public"."charges" c JOIN s ON c.charging_process_id = s.id
    ORDER BY c.date ASC LIMIT 20
  `;
  console.log(JSON.stringify(ticks, null, 2));

  console.log('\n=== 4d. Sessions DC (fast charger) ===');
  const dcSessions = await prisma.$queryRaw`
    SELECT cp.id, g.name,
           MAX(c.charger_voltage) as v_max, MAX(c.charger_actual_current) as a_max,
           MAX(c.charger_phases) as phases, MAX(c.charger_power) as power_max,
           BOOL_OR(c.fast_charger_present) as any_fast
    FROM "public"."charging_processes" cp
    LEFT JOIN "public"."geofences" g ON g.id = cp.geofence_id
    JOIN "public"."charges" c ON c.charging_process_id = cp.id
    WHERE c.fast_charger_present = true
    GROUP BY cp.id, g.name
    ORDER BY cp.id DESC LIMIT 5
  `;
  console.log(JSON.stringify(dcSessions, null, 2));

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
