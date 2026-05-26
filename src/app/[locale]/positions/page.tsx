import { Prisma } from "@prisma/client";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { PositionFilters } from "@/components/entities/positions/PositionFilters";
import { PositionListClient, type PositionRow } from "@/components/entities/positions/PositionListClient";
import { bulkDeletePositionsAction } from "./actions";

type SP = {
  drive_id?: string;
  from?: string;
  to?: string;
  cursor?: string;
  direction?: string;
  pageSize?: string;
};

const MAX_RANGE_DAYS = 31;

function parsePageSize(v?: string) {
  const n = v ? parseInt(v, 10) : 50;
  return [25, 50, 100].includes(n) ? n : 50;
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
  const from = sp.from && !Number.isNaN(new Date(sp.from).getTime()) ? new Date(sp.from) : null;
  const to = sp.to && !Number.isNaN(new Date(sp.to).getTime()) ? new Date(sp.to) : null;
  const pageSize = parsePageSize(sp.pageSize);
  const cursor = sp.cursor && /^\d+$/.test(sp.cursor) ? parseInt(sp.cursor, 10) : null;
  const direction = sp.direction === "prev" ? "prev" : "next";

  // Garde-fou : on REFUSE de scanner positions sans filtre étroit. Soit on a
  // un drive_id (l'index drive_id+date filtre déjà à quelques milliers), soit
  // on a (véhicule sélectionné + plage de dates ≤ 31 jours).
  let filtersValid = false;
  if (driveId != null) {
    filtersValid = true;
  } else if (selectedCar && from && to) {
    const rangeMs = to.getTime() - from.getTime();
    if (rangeMs >= 0 && rangeMs <= MAX_RANGE_DAYS * 86400_000) filtersValid = true;
  }

  let rows: PositionRow[] = [];
  let firstId: number | null = null;
  let lastId: number | null = null;
  let hasNext = false;
  let hasPrev = false;

  if (filtersValid) {
    const where: Prisma.positionsWhereInput = {};
    if (driveId != null) {
      where.drive_id = driveId;
    } else {
      where.car_id = selectedCar!.id;
      if (from || to) {
        where.date = {};
        if (from) (where.date as Prisma.DateTimeFilter).gte = from;
        if (to) (where.date as Prisma.DateTimeFilter).lte = to;
      }
    }
    if (cursor != null) {
      if (direction === "next") where.id = { lt: cursor };
      else where.id = { gt: cursor };
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
        speed: true,
        battery_level: true,
        car_id: true,
        drive_id: true,
      },
    });

    const hasMore = found.length > pageSize;
    const trimmed = hasMore ? found.slice(0, pageSize) : found;
    const ordered = direction === "prev" ? [...trimmed].reverse() : trimmed;

    rows = ordered.map((p) => ({
      id: p.id,
      date: p.date.toISOString(),
      latitude: p.latitude.toString(),
      longitude: p.longitude.toString(),
      speed: p.speed ?? null,
      battery_level: p.battery_level ?? null,
      car_id: p.car_id,
      drive_id: p.drive_id ?? null,
    }));

    firstId = rows.length > 0 ? rows[0].id : null;
    lastId = rows.length > 0 ? rows[rows.length - 1].id : null;
    hasNext = direction === "prev" ? cursor != null : hasMore;
    hasPrev = direction === "prev" ? hasMore : cursor != null;
  }

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>
        <div className="space-y-4">
          <PositionFilters
            filters={{
              from: sp.from ?? "",
              to: sp.to ?? "",
              drive_id: driveId != null ? String(driveId) : "",
            }}
          />
          <PositionListClient
            data={rows}
            firstId={firstId}
            lastId={lastId}
            hasNext={hasNext}
            hasPrev={hasPrev}
            pageSize={pageSize}
            filtersActive={filtersValid}
            deleteAction={bulkDeletePositionsAction}
          />
        </div>
      </main>
    </>
  );
}
