import { Prisma } from "@prisma/client";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { PositionFilters } from "@/components/entities/positions/PositionFilters";
import { PositionsMapPanel } from "@/components/entities/positions/PositionsMapPanel";
import type { DriveListItem } from "@/components/entities/positions/DriveFilterList";
import { PositionListClient, type PositionRow } from "@/components/entities/positions/PositionListClient";
import {
  computeQuickRange,
  isQuickRangeKey,
  DEFAULT_QUICK_RANGE,
  type QuickRangeKey,
} from "@/lib/positions/quick-ranges";
import { bulkDeletePositionsAction } from "./actions";

type SP = {
  drive_id?: string;
  from?: string;
  to?: string;
  qr?: string;
  cursor?: string;
  direction?: string;
  pageSize?: string;
};

// Le tableau (requête tous champs) garde un garde-fou de plage ; la carte, elle,
// charge en AJAX par lots sans limite de plage.
const MAX_TABLE_RANGE_DAYS = 31;

function parsePageSize(v?: string) {
  const n = v ? parseInt(v, 10) : 50;
  return [25, 50, 100].includes(n) ? n : 50;
}

function dec(v: Prisma.Decimal | null): string | null {
  return v == null ? null : v.toString();
}

export default async function PositionsPage({
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
  const t = await getTranslations("positions");

  const selectedCar = await getSelectedCarOrDefault();
  const driveId = sp.drive_id && /^\d+$/.test(sp.drive_id) ? parseInt(sp.drive_id, 10) : null;
  const rawFrom = sp.from && !Number.isNaN(new Date(sp.from).getTime()) ? new Date(sp.from) : null;
  const rawTo = sp.to && !Number.isNaN(new Date(sp.to).getTime()) ? new Date(sp.to) : null;
  const pageSize = parsePageSize(sp.pageSize);
  const cursor = sp.cursor && /^\d+$/.test(sp.cursor) ? parseInt(sp.cursor, 10) : null;
  const direction = sp.direction === "prev" ? "prev" : "next";

  // Plage effective : trajet ciblé > plage explicite > défaut 7 jours.
  let effFrom: Date | null = null;
  let effTo: Date | null = null;
  let activeRange: QuickRangeKey | null = null;

  if (driveId != null) {
    // Positions d'un trajet : pas de plage de dates.
  } else if (rawFrom || rawTo) {
    effFrom = rawFrom;
    effTo = rawTo;
    activeRange = isQuickRangeKey(sp.qr) ? sp.qr : null;
  } else {
    const def = computeQuickRange(DEFAULT_QUICK_RANGE)!;
    effFrom = def.from;
    effTo = def.to;
    activeRange = DEFAULT_QUICK_RANGE;
  }

  // Garde-fou TABLEAU uniquement : soit un drive_id, soit (véhicule + plage ≤ 31 j).
  const rangeMs = effFrom && effTo ? effTo.getTime() - effFrom.getTime() : -1;
  const rangeTooWide = rangeMs > MAX_TABLE_RANGE_DAYS * 86400_000;
  let tableValid = false;
  if (driveId != null) {
    tableValid = true;
  } else if (selectedCar && effFrom && effTo && rangeMs >= 0 && !rangeTooWide) {
    tableValid = true;
  }

  // Requête « trajets de la plage » pour les cases à cocher (peu de lignes).
  async function loadDrives(): Promise<DriveListItem[]> {
    const serialize = (d: {
      id: number;
      start_date: Date;
      end_date: Date | null;
      distance: number | null;
    }): DriveListItem => ({
      id: d.id,
      start_date: d.start_date.toISOString(),
      end_date: d.end_date ? d.end_date.toISOString() : null,
      distance: d.distance ?? null,
    });

    if (driveId != null) {
      const d = await prisma.drives.findUnique({
        where: { id: driveId },
        select: { id: true, start_date: true, end_date: true, distance: true },
      });
      return d ? [serialize(d)] : [];
    }
    if (selectedCar && effFrom && effTo) {
      const list = await prisma.drives.findMany({
        where: {
          car_id: selectedCar.id,
          start_date: { lte: effTo },
          OR: [{ end_date: { gte: effFrom } }, { end_date: null }],
        },
        orderBy: { start_date: "desc" },
        take: 1000,
        select: { id: true, start_date: true, end_date: true, distance: true },
      });
      return list.map(serialize);
    }
    return [];
  }

  // Requête TABLEAU (curseur, tous champs) — seulement si garde-fou satisfait.
  async function loadTableRows() {
    if (!tableValid) {
      return { rows: [] as PositionRow[], firstId: null, lastId: null, hasNext: false, hasPrev: false };
    }
    const where: Prisma.positionsWhereInput = {};
    if (driveId != null) {
      where.drive_id = driveId;
    } else {
      where.car_id = selectedCar!.id;
      where.date = {};
      if (effFrom) (where.date as Prisma.DateTimeFilter).gte = effFrom;
      if (effTo) (where.date as Prisma.DateTimeFilter).lte = effTo;
    }
    if (cursor != null) {
      where.id = direction === "next" ? { lt: cursor } : { gt: cursor };
    }

    const found = await prisma.positions.findMany({
      where,
      orderBy: { id: direction === "prev" ? "asc" : "desc" },
      take: pageSize + 1,
      select: {
        id: true,
        date: true,
        latitude: true,
        longitude: true,
        car_id: true,
        drive_id: true,
        speed: true,
        power: true,
        odometer: true,
        elevation: true,
        outside_temp: true,
        inside_temp: true,
        battery_level: true,
        usable_battery_level: true,
        ideal_battery_range_km: true,
        rated_battery_range_km: true,
        est_battery_range_km: true,
        fan_status: true,
        driver_temp_setting: true,
        passenger_temp_setting: true,
        is_climate_on: true,
        is_rear_defroster_on: true,
        is_front_defroster_on: true,
        battery_heater: true,
        battery_heater_on: true,
        battery_heater_no_power: true,
        tpms_pressure_fl: true,
        tpms_pressure_fr: true,
        tpms_pressure_rl: true,
        tpms_pressure_rr: true,
      },
    });

    const hasMore = found.length > pageSize;
    const trimmed = hasMore ? found.slice(0, pageSize) : found;
    const ordered = direction === "prev" ? [...trimmed].reverse() : trimmed;

    const rows: PositionRow[] = ordered.map((p) => ({
      id: p.id,
      date: p.date.toISOString(),
      latitude: p.latitude.toString(),
      longitude: p.longitude.toString(),
      car_id: p.car_id,
      drive_id: p.drive_id ?? null,
      speed: p.speed ?? null,
      power: p.power ?? null,
      odometer: p.odometer ?? null,
      elevation: p.elevation ?? null,
      outside_temp: dec(p.outside_temp),
      inside_temp: dec(p.inside_temp),
      battery_level: p.battery_level ?? null,
      usable_battery_level: p.usable_battery_level ?? null,
      ideal_battery_range_km: dec(p.ideal_battery_range_km),
      rated_battery_range_km: dec(p.rated_battery_range_km),
      est_battery_range_km: dec(p.est_battery_range_km),
      fan_status: p.fan_status ?? null,
      driver_temp_setting: dec(p.driver_temp_setting),
      passenger_temp_setting: dec(p.passenger_temp_setting),
      is_climate_on: p.is_climate_on ?? null,
      is_rear_defroster_on: p.is_rear_defroster_on ?? null,
      is_front_defroster_on: p.is_front_defroster_on ?? null,
      battery_heater: p.battery_heater ?? null,
      battery_heater_on: p.battery_heater_on ?? null,
      battery_heater_no_power: p.battery_heater_no_power ?? null,
      tpms_pressure_fl: dec(p.tpms_pressure_fl),
      tpms_pressure_fr: dec(p.tpms_pressure_fr),
      tpms_pressure_rl: dec(p.tpms_pressure_rl),
      tpms_pressure_rr: dec(p.tpms_pressure_rr),
    }));

    return {
      rows,
      firstId: rows.length > 0 ? rows[0].id : null,
      lastId: rows.length > 0 ? rows[rows.length - 1].id : null,
      hasNext: direction === "prev" ? cursor != null : hasMore,
      hasPrev: direction === "prev" ? hasMore : cursor != null,
    };
  }

  const [drives, table] = await Promise.all([loadDrives(), loadTableRows()]);

  const filterValues = {
    from: driveId != null ? "" : effFrom ? effFrom.toISOString() : "",
    to: driveId != null ? "" : effTo ? effTo.toISOString() : "",
    drive_id: driveId != null ? String(driveId) : "",
  };

  const mapParams = {
    from: driveId != null ? null : effFrom ? effFrom.toISOString() : null,
    to: driveId != null ? null : effTo ? effTo.toISOString() : null,
    driveId,
  };

  const tableNotice = rangeTooWide ? t("map.tableLimited") : t("filtersRequired");

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>

        <div className="grid gap-4 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <PositionFilters filters={filterValues} activeRange={activeRange} />
          </div>
          <div className="lg:col-span-3">
            <PositionsMapPanel params={mapParams} drives={drives} />
          </div>
        </div>

        <div className="mt-4">
          <PositionListClient
            data={table.rows}
            firstId={table.firstId}
            lastId={table.lastId}
            hasNext={table.hasNext}
            hasPrev={table.hasPrev}
            pageSize={pageSize}
            filtersActive={tableValid}
            inactiveNotice={tableNotice}
            deleteAction={bulkDeletePositionsAction}
          />
        </div>
      </main>
    </>
  );
}
