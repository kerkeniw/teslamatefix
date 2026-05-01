// Smoke test : compte les lignes des principales tables TeslaMate.
// Usage : `node --env-file=.env scripts/check-db.mjs`
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const counts = {
  cars: await prisma.cars.count(),
  drives: await prisma.drives.count(),
  charging_processes: await prisma.charging_processes.count(),
  positions: await prisma.positions.count(),
  charges: await prisma.charges.count(),
  addresses: await prisma.addresses.count(),
  geofences: await prisma.geofences.count(),
  states: await prisma.states.count(),
  updates: await prisma.updates.count(),
  settings: await prisma.settings.count(),
};

console.log(counts);

await prisma.$disconnect();
