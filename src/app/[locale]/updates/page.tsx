import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { UpdateListClient } from "@/components/entities/updates/UpdateListClient";
import type { UpdateRow } from "@/components/entities/updates/UpdateDataTableColumns";

type SP = { page?: string; pageSize?: string };

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

export default async function UpdatesPage({
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
  const t = await getTranslations("updates");

  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);

  const [rawRows, total, cars] = await Promise.all([
    prisma.updates.findMany({
      orderBy: { start_date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.updates.count(),
    prisma.cars.findMany({
      select: { id: true, name: true, vin: true, model: true },
    }),
  ]);

  const carMap = new Map(cars.map((c) => [c.id, carLabel(c)]));

  const rows: UpdateRow[] = rawRows.map((r) => ({
    id: r.id,
    start_date: r.start_date.toISOString(),
    end_date: r.end_date ? r.end_date.toISOString() : null,
    version: r.version,
    car_id: r.car_id,
    car_label: carMap.get(r.car_id) ?? `#${r.car_id}`,
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
        <UpdateListClient
          data={rows}
          total={total}
          page={page}
          pageSize={pageSize}
        />
      </main>
    </>
  );
}
