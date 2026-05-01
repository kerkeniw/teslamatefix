import { Prisma } from "@prisma/client";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { ChargeListClient } from "@/components/entities/charges/ChargeListClient";
import type { ChargeRow } from "@/components/entities/charges/ChargeDataTableColumns";

type SP = {
  page?: string;
  pageSize?: string;
  car_id?: string;
  from?: string;
  to?: string;
};

function parsePage(v?: string) {
  const n = v ? parseInt(v, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function parsePageSize(v?: string) {
  const n = v ? parseInt(v, 10) : 25;
  return [25, 50, 100].includes(n) ? n : 25;
}
function carLabel(c: { id: number; name: string | null; vin: string | null; model: string | null }): string {
  return c.name ?? c.vin ?? c.model ?? `#${c.id}`;
}

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
  const carId = sp.car_id && /^\d+$/.test(sp.car_id) ? parseInt(sp.car_id, 10) : null;
  const from = sp.from && !Number.isNaN(new Date(sp.from).getTime()) ? new Date(sp.from) : null;
  const to = sp.to && !Number.isNaN(new Date(sp.to).getTime()) ? new Date(sp.to) : null;

  const where: Prisma.charging_processesWhereInput = {};
  if (carId != null) where.car_id = carId;
  if (from || to) {
    where.start_date = {};
    if (from) (where.start_date as Prisma.DateTimeFilter).gte = from;
    if (to) (where.start_date as Prisma.DateTimeFilter).lte = to;
  }

  const [rawRows, total, cars] = await Promise.all([
    prisma.charging_processes.findMany({
      where,
      orderBy: { start_date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        start_date: true,
        end_date: true,
        car_id: true,
        charge_energy_added: true,
        duration_min: true,
        cost: true,
        addresses: { select: { display_name: true, city: true } },
        geofences: { select: { name: true } },
      },
    }),
    prisma.charging_processes.count({ where }),
    prisma.cars.findMany({ select: { id: true, name: true, vin: true, model: true } }),
  ]);

  // Pour distinguer AC/DC sans rejoindre des millions de ticks, on regarde le
  // dernier tick de chaque session (limité à la page courante seulement).
  const ids = rawRows.map((r) => r.id);
  const lastTicks = ids.length
    ? await prisma.charges.findMany({
        where: { charging_process_id: { in: ids } },
        orderBy: { date: "desc" },
        distinct: ["charging_process_id"],
        select: { charging_process_id: true, fast_charger_present: true },
      })
    : [];
  const fastByProcess = new Map(
    lastTicks.map((t) => [t.charging_process_id, t.fast_charger_present]),
  );

  const carMap = new Map(cars.map((c) => [c.id, carLabel(c)]));
  const rows: ChargeRow[] = rawRows.map((r) => ({
    id: r.id,
    start_date: r.start_date.toISOString(),
    end_date: r.end_date ? r.end_date.toISOString() : null,
    car_id: r.car_id,
    car_label: carMap.get(r.car_id) ?? `#${r.car_id}`,
    place: r.geofences?.name ?? r.addresses?.display_name ?? r.addresses?.city ?? null,
    charge_energy_added: r.charge_energy_added != null ? Number(r.charge_energy_added) : null,
    duration_min: r.duration_min ?? null,
    cost: r.cost != null ? Number(r.cost) : null,
    fast_charger: fastByProcess.get(r.id) ?? null,
  }));

  const carOptions = cars.map((c) => ({ id: c.id, label: carLabel(c) }));

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>
        <ChargeListClient
          data={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          cars={carOptions}
          filters={{
            car_id: carId != null ? String(carId) : "",
            from: sp.from ?? "",
            to: sp.to ?? "",
          }}
        />
      </main>
    </>
  );
}
