import { prisma } from "./db";
import { getSelectedCarId } from "./vehicle";
import { getVehicleImages, type VehicleImageSet } from "./tesla/vehicle-image";

export type DashboardData = {
  car: {
    id: number;
    name: string | null;
    vin: string | null;
    model: string | null;
    marketingName: string | null;
    /**
     * Jeu de photos officielles Tesla (compositor), une par vue, + origine des
     * codes. `null` si aucun code exploitable (pas d'image).
     */
    image: VehicleImageSet | null;
  } | null;
  currentState: {
    state: "online" | "offline" | "asleep";
    sinceIso: string;
  } | null;
  firmwareVersion: string | null;
  lastDrive: {
    id: number;
    startDateIso: string;
    distanceKm: number | null;
    durationMin: number | null;
    startCity: string | null;
    endCity: string | null;
  } | null;
  lastCharge: {
    id: number;
    startDateIso: string;
    energyKwh: number | null;
    durationMin: number | null;
    locationLabel: string | null;
  } | null;
  monthCounts: {
    drives: number;
    charges: number;
  };
  anomalies: Array<{
    kind: "openDrive" | "openChargingProcess" | "openState";
    id: number;
    sinceIso: string;
    label: string;
    href: string;
  }>;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export async function getDashboardData(): Promise<DashboardData> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Le dashboard suit le véhicule sélectionné dans le cookie ; fallback sur le
  // premier (display_priority asc) si rien de cohérent en cookie.
  const selectedId = await getSelectedCarId();
  const car = selectedId
    ? await prisma.cars.findUnique({
        where: { id: selectedId },
        select: {
          id: true,
          name: true,
          vin: true,
          model: true,
          marketing_name: true,
        },
      })
    : await prisma.cars.findFirst({
        orderBy: { display_priority: "asc" },
        select: {
          id: true,
          name: true,
          vin: true,
          model: true,
          marketing_name: true,
        },
      });

  const [
    currentState,
    lastUpdate,
    lastDrive,
    lastChargingProcess,
    drivesCount,
    chargesCount,
    openDrivesRaw,
    openProcessesRaw,
    openStatesRaw,
  ] = await Promise.all([
    car
      ? prisma.states.findFirst({
          where: { car_id: car.id, end_date: null },
          orderBy: { start_date: "desc" },
          select: { state: true, start_date: true },
        })
      : Promise.resolve(null),
    car
      ? prisma.updates.findFirst({
          where: { car_id: car.id, NOT: { version: null } },
          orderBy: { start_date: "desc" },
          select: { version: true },
        })
      : Promise.resolve(null),
    car
      ? prisma.drives.findFirst({
          where: { car_id: car.id },
          orderBy: { start_date: "desc" },
          select: {
            id: true,
            start_date: true,
            distance: true,
            duration_min: true,
            addresses_drives_start_address_idToaddresses: { select: { city: true } },
            addresses_drives_end_address_idToaddresses: { select: { city: true } },
          },
        })
      : Promise.resolve(null),
    car
      ? prisma.charging_processes.findFirst({
          where: { car_id: car.id },
          orderBy: { start_date: "desc" },
          select: {
            id: true,
            start_date: true,
            charge_energy_added: true,
            duration_min: true,
            addresses: { select: { display_name: true, city: true } },
            geofences: { select: { name: true } },
          },
        })
      : Promise.resolve(null),
    car
      ? prisma.drives.count({
          where: { car_id: car.id, start_date: { gte: monthStart } },
        })
      : Promise.resolve(0),
    car
      ? prisma.charging_processes.count({
          where: { car_id: car.id, start_date: { gte: monthStart } },
        })
      : Promise.resolve(0),
    car
      ? prisma.drives.findMany({
          where: {
            car_id: car.id,
            end_date: null,
            start_date: { lt: new Date(now.getTime() - ONE_DAY_MS) },
          },
          orderBy: { start_date: "desc" },
          take: 5,
          select: { id: true, start_date: true },
        })
      : Promise.resolve([]),
    car
      ? prisma.charging_processes.findMany({
          where: {
            car_id: car.id,
            end_date: null,
            start_date: { lt: new Date(now.getTime() - ONE_DAY_MS) },
          },
          orderBy: { start_date: "desc" },
          take: 5,
          select: { id: true, start_date: true },
        })
      : Promise.resolve([]),
    car
      ? prisma.states.findMany({
          where: {
            car_id: car.id,
            end_date: null,
            start_date: { lt: new Date(now.getTime() - SEVEN_DAYS_MS) },
          },
          orderBy: { start_date: "desc" },
          take: 5,
          select: { id: true, start_date: true, state: true },
        })
      : Promise.resolve([]),
  ]);

  const anomalies: DashboardData["anomalies"] = [
    ...openDrivesRaw.map((d) => ({
      kind: "openDrive" as const,
      id: d.id,
      sinceIso: d.start_date.toISOString(),
      label: `Drive #${d.id}`,
      href: `/drives/${d.id}`,
    })),
    ...openProcessesRaw.map((p) => ({
      kind: "openChargingProcess" as const,
      id: p.id,
      sinceIso: p.start_date.toISOString(),
      label: `Charge #${p.id}`,
      href: `/charges/${p.id}`,
    })),
    ...openStatesRaw.map((s) => ({
      kind: "openState" as const,
      id: s.id,
      sinceIso: s.start_date.toISOString(),
      label: `${s.state} #${s.id}`,
      href: `/states/${s.id}`,
    })),
  ];

  const startCity =
    lastDrive?.addresses_drives_start_address_idToaddresses?.city ?? null;
  const endCity =
    lastDrive?.addresses_drives_end_address_idToaddresses?.city ?? null;

  const lastChargeLocation =
    lastChargingProcess?.geofences?.name ??
    lastChargingProcess?.addresses?.display_name ??
    lastChargingProcess?.addresses?.city ??
    null;

  // Photo officielle : cache → Fleet API → TESLA_VEHICLE_OPTIONS (ne lève jamais ;
  // `null` si rien). Borné par le timeout du fetch côté `vehicle-image`.
  const image = car
    ? await getVehicleImages({ vin: car.vin, model: car.model })
    : null;

  return {
    car: car
      ? {
          id: car.id,
          name: car.name,
          vin: car.vin,
          model: car.model,
          marketingName: car.marketing_name,
          image,
        }
      : null,
    currentState: currentState
      ? {
          state: currentState.state as "online" | "offline" | "asleep",
          sinceIso: currentState.start_date.toISOString(),
        }
      : null,
    firmwareVersion: lastUpdate?.version ?? null,
    lastDrive: lastDrive
      ? {
          id: lastDrive.id,
          startDateIso: lastDrive.start_date.toISOString(),
          distanceKm: lastDrive.distance ?? null,
          durationMin: lastDrive.duration_min ?? null,
          startCity,
          endCity,
        }
      : null,
    lastCharge: lastChargingProcess
      ? {
          id: lastChargingProcess.id,
          startDateIso: lastChargingProcess.start_date.toISOString(),
          energyKwh: lastChargingProcess.charge_energy_added
            ? Number(lastChargingProcess.charge_energy_added)
            : null,
          durationMin: lastChargingProcess.duration_min ?? null,
          locationLabel: lastChargeLocation,
        }
      : null,
    monthCounts: {
      drives: drivesCount,
      charges: chargesCount,
    },
    anomalies,
  };
}
