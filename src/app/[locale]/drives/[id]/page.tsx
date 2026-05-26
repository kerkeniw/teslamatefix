import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { DriveTabs } from "@/components/entities/drives/DriveTabs";
import { ChildrenPositionsTable } from "@/components/entities/drives/ChildrenPositionsTable";
import { DriveRecalcPanel } from "@/components/entities/drives/RecalcPanel";
import type {
  DriveFormValues,
  DriveFormInitialOptions,
} from "@/components/entities/drives/DriveForm";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import type { FKOption } from "@/components/form/fk-combobox";
import {
  updateDriveAction,
  deleteDriveAction,
  recalcDriveAction,
  applyRecalcDriveAction,
} from "../actions";

function addressLabel(a: {
  id: number;
  display_name: string | null;
  city: string | null;
  road: string | null;
  country: string | null;
}): string {
  const parts = [a.road, a.city, a.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : (a.display_name ?? `#${a.id}`);
}

function decimalString(v: { toString(): string } | null | undefined): string {
  return v == null ? "" : v.toString();
}

export default async function DriveEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: idStr } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("drives");
  const tCommon = await getTranslations("common");

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const [drive, selectedCar, positionsCount, positionsHead] = await Promise.all([
    prisma.drives.findUnique({ where: { id } }),
    getSelectedCarOrDefault(),
    prisma.positions.count({ where: { drive_id: id } }),
    prisma.positions.findMany({
      where: { drive_id: id },
      orderBy: { date: "asc" },
      take: 50,
      select: {
        id: true,
        date: true,
        latitude: true,
        longitude: true,
        speed: true,
        battery_level: true,
      },
    }),
  ]);
  if (!drive || !selectedCar) notFound();

  // Précharge uniquement les libellés des FK référencées par ce drive — la
  // recherche typeahead complète passe par les server actions search-*.
  const refAddressIds: number[] = [];
  if (drive.start_address_id) refAddressIds.push(drive.start_address_id);
  if (drive.end_address_id && drive.end_address_id !== drive.start_address_id) {
    refAddressIds.push(drive.end_address_id);
  }
  const refGeofenceIds: number[] = [];
  if (drive.start_geofence_id) refGeofenceIds.push(drive.start_geofence_id);
  if (drive.end_geofence_id && drive.end_geofence_id !== drive.start_geofence_id) {
    refGeofenceIds.push(drive.end_geofence_id);
  }

  const [refAddresses, refGeofences] = await Promise.all([
    refAddressIds.length
      ? prisma.addresses.findMany({
          where: { id: { in: refAddressIds } },
          select: {
            id: true,
            display_name: true,
            city: true,
            road: true,
            country: true,
          },
        })
      : Promise.resolve([]),
    refGeofenceIds.length
      ? prisma.geofences.findMany({
          where: { id: { in: refGeofenceIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  function findAddress(id: number | null): FKOption | null {
    if (id == null) return null;
    const a = refAddresses.find((x) => x.id === id);
    return a ? { id: a.id, label: addressLabel(a) } : { id, label: `#${id}` };
  }
  function findGeofence(id: number | null): FKOption | null {
    if (id == null) return null;
    const g = refGeofences.find((x) => x.id === id);
    return g ? { id: g.id, label: g.name } : { id, label: `#${id}` };
  }

  const initial: DriveFormValues = {
    car_id: String(drive.car_id),
    start_date: drive.start_date.toISOString(),
    end_date: drive.end_date ? drive.end_date.toISOString() : "",
    start_km: drive.start_km != null ? String(drive.start_km) : "",
    end_km: drive.end_km != null ? String(drive.end_km) : "",
    distance: drive.distance != null ? String(drive.distance) : "",
    duration_min: drive.duration_min != null ? String(drive.duration_min) : "",
    start_address_id: drive.start_address_id != null ? String(drive.start_address_id) : "",
    end_address_id: drive.end_address_id != null ? String(drive.end_address_id) : "",
    start_geofence_id: drive.start_geofence_id != null ? String(drive.start_geofence_id) : "",
    end_geofence_id: drive.end_geofence_id != null ? String(drive.end_geofence_id) : "",
    start_ideal_range_km: decimalString(drive.start_ideal_range_km),
    end_ideal_range_km: decimalString(drive.end_ideal_range_km),
    start_rated_range_km: decimalString(drive.start_rated_range_km),
    end_rated_range_km: decimalString(drive.end_rated_range_km),
    outside_temp_avg: decimalString(drive.outside_temp_avg),
    inside_temp_avg: decimalString(drive.inside_temp_avg),
    speed_max: drive.speed_max != null ? String(drive.speed_max) : "",
    power_min: drive.power_min != null ? String(drive.power_min) : "",
    power_max: drive.power_max != null ? String(drive.power_max) : "",
    ascent: drive.ascent != null ? String(drive.ascent) : "",
    descent: drive.descent != null ? String(drive.descent) : "",
  };

  const initialOptions: DriveFormInitialOptions = {
    car: { id: selectedCar.id, label: selectedCar.label },
    startAddress: findAddress(drive.start_address_id),
    endAddress: findAddress(drive.end_address_id),
    startGeofence: findGeofence(drive.start_geofence_id),
    endGeofence: findGeofence(drive.end_geofence_id),
  };

  const positions = positionsHead.map((p) => ({
    id: p.id,
    date: p.date.toISOString(),
    latitude: p.latitude.toString(),
    longitude: p.longitude.toString(),
    speed: p.speed ?? null,
    battery_level: p.battery_level ?? null,
  }));

  const boundUpdate = updateDriveAction.bind(null, id);
  const boundDelete = deleteDriveAction.bind(null, id);

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/drives">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("edit")}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">#{drive.id}</p>
        </header>
        <DriveTabs
          id={drive.id}
          initial={initial}
          initialOptions={initialOptions}
          readOnly={env.READ_ONLY}
          saveAction={boundUpdate}
          deleteAction={boundDelete}
          positionsTab={
            <ChildrenPositionsTable
              driveId={drive.id}
              positions={positions}
              total={positionsCount}
            />
          }
          recalcTab={
            <DriveRecalcPanel
              driveId={drive.id}
              computeAction={recalcDriveAction}
              applyAction={applyRecalcDriveAction}
              readOnly={env.READ_ONLY}
            />
          }
        />
      </main>
    </>
  );
}
