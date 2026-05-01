import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { DriveTabs } from "@/components/entities/drives/DriveTabs";
import { ChildrenPositionsTable } from "@/components/entities/drives/ChildrenPositionsTable";
import { DriveRecalcPanel } from "@/components/entities/drives/RecalcPanel";
import type { DriveFormValues } from "@/components/entities/drives/DriveForm";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  updateDriveAction,
  deleteDriveAction,
  recalcDriveAction,
  applyRecalcDriveAction,
} from "../actions";

const FK_LIST_LIMIT = 200;

function carLabel(c: { id: number; name: string | null; vin: string | null; model: string | null }): string {
  return c.name ?? c.vin ?? c.model ?? `#${c.id}`;
}
function addressLabel(a: {
  id: number;
  display_name: string | null;
  city: string | null;
  road: string | null;
}): string {
  return a.display_name ?? a.city ?? a.road ?? `#${a.id}`;
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

  const [drive, cars, addresses, geofences, positionsCount, positionsHead] = await Promise.all([
    prisma.drives.findUnique({ where: { id } }),
    prisma.cars.findMany({
      select: { id: true, name: true, vin: true, model: true },
      orderBy: { id: "asc" },
    }),
    // FK selects bornés à 200 lignes pour ne pas exploser le bundle ; pour
    // les utilisateurs qui ont besoin d'une autre adresse, le champ texte
    // pourra évoluer plus tard vers un combobox avec recherche.
    prisma.addresses.findMany({
      select: { id: true, display_name: true, city: true, road: true },
      orderBy: { id: "desc" },
      take: FK_LIST_LIMIT,
    }),
    prisma.geofences.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
      take: FK_LIST_LIMIT,
    }),
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
  if (!drive) notFound();

  const carOptions = cars.map((c) => ({ id: c.id, label: carLabel(c) }));
  const addressOptions = addresses.map((a) => ({ id: a.id, label: addressLabel(a) }));
  // Si le drive référence une adresse hors top 200, on l'ajoute en tête de liste.
  const referenceAddressIds = new Set<number>();
  if (drive.start_address_id) referenceAddressIds.add(drive.start_address_id);
  if (drive.end_address_id) referenceAddressIds.add(drive.end_address_id);
  for (const a of addressOptions) referenceAddressIds.delete(a.id);
  if (referenceAddressIds.size > 0) {
    const extra = await prisma.addresses.findMany({
      where: { id: { in: [...referenceAddressIds] } },
      select: { id: true, display_name: true, city: true, road: true },
    });
    for (const a of extra) addressOptions.unshift({ id: a.id, label: addressLabel(a) });
  }
  const geofenceOptions = geofences.map((g) => ({ id: g.id, label: g.name }));

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
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="mb-4">
          <Button variant="ghost" size="sm" render={<Link href="/drives" />}>
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </Button>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("edit")}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">#{drive.id}</p>
        </header>
        <DriveTabs
          id={drive.id}
          initial={initial}
          cars={carOptions}
          addresses={addressOptions}
          geofences={geofenceOptions}
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
