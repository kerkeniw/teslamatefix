import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import {
  ChargeListClient,
  type ChargeTypeFilter,
} from "@/components/entities/charges/ChargeListClient";
import type { FKOption } from "@/components/form/fk-combobox";
import {
  listCharges,
  type ChargeListRow,
  type ChargeListSummary,
  type ChargeType,
} from "@/lib/charges/list-query";
import { isQuickRangeKey } from "@/lib/positions/quick-ranges";
import type { LengthUnit, TempUnit, PreferredRange } from "@/lib/units";

type SP = {
  page?: string;
  pageSize?: string;
  from?: string;
  to?: string;
  qr?: string;
  open_only?: string;
  location?: string;
  geofence?: string;
  type?: string;
  min_cost?: string;
  min_duration?: string;
  min_added?: string;
  min_used?: string;
  max_eff?: string;
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
function parseDate(v?: string): Date | null {
  return v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : null;
}

const EMPTY_SUMMARY: ChargeListSummary = {
  count: 0,
  energy_added: null,
  energy_used: null,
  cost: null,
  avg_duration_min: null,
};

export default async function ChargesPage({
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
  const t = await getTranslations("charges");

  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const openOnly = sp.open_only === "1";
  const location = sp.location?.trim() ? sp.location.trim() : null;
  const geofenceIds = parseIds(sp.geofence);
  const type: ChargeTypeFilter = sp.type === "AC" || sp.type === "DC" ? sp.type : "";
  const types: ChargeType[] = type ? [type] : [];

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

  let rows: ChargeListRow[] = [];
  let total = 0;
  let summary = EMPTY_SUMMARY;
  if (selectedCar) {
    const res = await listCharges({
      carId: selectedCar.id,
      from: parseDate(sp.from),
      to: parseDate(sp.to),
      openOnly,
      geofenceIds,
      location,
      types,
      minCost: parseNum(sp.min_cost),
      minDurationMin: parseNum(sp.min_duration),
      minAddedKwh: parseNum(sp.min_added),
      minUsedKwh: parseNum(sp.min_used),
      maxEfficiencyPct: parseNum(sp.max_eff),
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
      <main className="mx-auto w-full max-w-none flex-1 px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>
        <ChargeListClient
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
            location: sp.location ?? "",
            geofence: geofenceIds,
            type,
            min_cost: sp.min_cost ?? "",
            min_duration: sp.min_duration ?? "",
            min_added: sp.min_added ?? "",
            min_used: sp.min_used ?? "",
            max_eff: sp.max_eff ?? "",
          }}
          units={units}
          geofenceInitial={geofenceInitial}
        />
      </main>
    </>
  );
}
