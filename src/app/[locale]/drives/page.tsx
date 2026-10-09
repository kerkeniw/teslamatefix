import { setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { DriveListClient } from "@/components/entities/drives/DriveListClient";
import type { DriveListRow, DriveListSummary } from "@/lib/drives/list-query";
import { isQuickRangeKey } from "@/lib/positions/quick-ranges";
import { listDrives } from "@/lib/drives/list-query";
import type { FKOption } from "@/components/form/fk-combobox";
import type { EfficiencyMode } from "@/components/entities/drives/DriveDataTableColumns";
import {
  unitToKm,
  kmhFromUnit,
  type LengthUnit,
  type TempUnit,
  type PreferredRange,
} from "@/lib/units";

type SP = {
  page?: string;
  pageSize?: string;
  from?: string;
  to?: string;
  qr?: string;
  open_only?: string;
  min_dist?: string;
  min_speed?: string;
  location?: string;
  geofence?: string;
  eff?: string;
};

const EMPTY_SUMMARY: DriveListSummary = {
  count: 0,
  distance_km: null,
  duration_min: null,
  energy_kwh: null,
  consumption_wh_km: null,
};

function parsePage(v?: string) {
  const n = v ? parseInt(v, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function parsePageSize(v?: string) {
  const n = v ? parseInt(v, 10) : 25;
  return [25, 50, 100].includes(n) ? n : 25;
}
function parseNum(v?: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parseIds(v?: string): number[] {
  if (!v) return [];
  return v
    .split(",")
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}

export default async function DrivesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SP>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const sp = await searchParams;

  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const from = sp.from && !Number.isNaN(new Date(sp.from).getTime()) ? new Date(sp.from) : null;
  const to = sp.to && !Number.isNaN(new Date(sp.to).getTime()) ? new Date(sp.to) : null;
  const openOnly = sp.open_only === "1";
  const location = sp.location?.trim() ? sp.location.trim() : null;
  const geofenceIds = parseIds(sp.geofence);
  const efficiencyMode: EfficiencyMode = sp.eff === "distance" ? "distance" : "slope";

  const [selectedCar, settings] = await Promise.all([
    getSelectedCarOrDefault(),
    prisma.settings.findFirst(),
  ]);

  const units: { length: LengthUnit; temp: TempUnit } = {
    length: settings?.unit_of_length === "mi" ? "mi" : "km",
    temp: settings?.unit_of_temperature === "F" ? "F" : "C",
  };
  const preferredRange: PreferredRange =
    settings?.preferred_range === "ideal" ? "ideal" : "rated";

  // Seuils saisis dans l'unité utilisateur → convertis en métrique pour la requête.
  const minDistUser = parseNum(sp.min_dist);
  const minSpeedUser = parseNum(sp.min_speed);
  const minDistKm = minDistUser != null ? unitToKm(minDistUser, units.length) : null;
  const minSpeedKmh = minSpeedUser != null ? kmhFromUnit(minSpeedUser, units.length) : null;

  let rows: DriveListRow[] = [];
  let total = 0;
  let summary: DriveListSummary = EMPTY_SUMMARY;
  if (selectedCar) {
    const res = await listDrives({
      carId: selectedCar.id,
      from,
      to,
      openOnly,
      minDistKm,
      minSpeedKmh,
      geofenceIds,
      location,
      preferredRange,
      page,
      pageSize,
    });
    rows = res.rows;
    total = res.total;
    summary = res.summary;
  }

  // Libellés des géofences pré-sélectionnées (pour les puces du filtre).
  const geofenceInitial: FKOption[] = geofenceIds.length
    ? (
        await prisma.geofences.findMany({
          where: { id: { in: geofenceIds } },
          select: { id: true, name: true },
        })
      ).map((g) => ({ id: g.id, label: g.name }))
    : [];

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-none flex-1 px-4 py-4">
        <DriveListClient
          data={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          summary={summary}
          filters={{
            from: sp.from ?? "",
            to: sp.to ?? "",
            qr: sp.qr && isQuickRangeKey(sp.qr) ? sp.qr : null,
            open_only: openOnly,
            min_dist: sp.min_dist ?? "",
            min_speed: sp.min_speed ?? "",
            location: sp.location ?? "",
            geofence: geofenceIds,
            eff: efficiencyMode,
          }}
          units={units}
          geofenceInitial={geofenceInitial}
        />
      </main>
    </>
  );
}
