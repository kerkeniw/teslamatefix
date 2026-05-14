import { Prisma } from "@prisma/client";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { DriveListClient } from "@/components/entities/drives/DriveListClient";
import type { DriveRow } from "@/components/entities/drives/DriveDataTableColumns";

type SP = {
  page?: string;
  pageSize?: string;
  from?: string;
  to?: string;
  open_only?: string;
};

function parsePage(v?: string) {
  const n = v ? parseInt(v, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function parsePageSize(v?: string) {
  const n = v ? parseInt(v, 10) : 25;
  return [25, 50, 100].includes(n) ? n : 25;
}

function addressLabel(a: {
  city: string | null;
  road: string | null;
  display_name: string | null;
} | null): string | null {
  if (!a) return null;
  return a.city ?? a.road ?? a.display_name ?? null;
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
  const t = await getTranslations("drives");

  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const from = sp.from && !Number.isNaN(new Date(sp.from).getTime()) ? new Date(sp.from) : null;
  const to = sp.to && !Number.isNaN(new Date(sp.to).getTime()) ? new Date(sp.to) : null;
  const openOnly = sp.open_only === "1";

  const selectedCar = await getSelectedCarOrDefault();

  const where: Prisma.drivesWhereInput = {};
  if (selectedCar) where.car_id = selectedCar.id;
  if (from || to) {
    where.start_date = {};
    if (from) (where.start_date as Prisma.DateTimeFilter).gte = from;
    if (to) (where.start_date as Prisma.DateTimeFilter).lte = to;
  }
  if (openOnly) where.end_date = null;

  const [rawRows, total] = await Promise.all([
    prisma.drives.findMany({
      where,
      orderBy: { start_date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        start_date: true,
        end_date: true,
        car_id: true,
        distance: true,
        duration_min: true,
        addresses_drives_start_address_idToaddresses: {
          select: { city: true, road: true, display_name: true },
        },
        addresses_drives_end_address_idToaddresses: {
          select: { city: true, road: true, display_name: true },
        },
      },
    }),
    prisma.drives.count({ where }),
  ]);

  const rows: DriveRow[] = rawRows.map((r) => ({
    id: r.id,
    start_date: r.start_date.toISOString(),
    end_date: r.end_date ? r.end_date.toISOString() : null,
    car_id: r.car_id,
    car_label: selectedCar?.label ?? `#${r.car_id}`,
    origin: addressLabel(r.addresses_drives_start_address_idToaddresses),
    destination: addressLabel(r.addresses_drives_end_address_idToaddresses),
    distance: r.distance ?? null,
    duration_min: r.duration_min ?? null,
  }));

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>
        <DriveListClient
          data={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          filters={{
            from: sp.from ?? "",
            to: sp.to ?? "",
            open_only: openOnly,
          }}
        />
      </main>
    </>
  );
}
