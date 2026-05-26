import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
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
  const selectedCar = await getSelectedCarOrDefault();
  const where = selectedCar ? { car_id: selectedCar.id } : {};

  const [rawRows, total] = await Promise.all([
    prisma.updates.findMany({
      where,
      orderBy: { start_date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.updates.count({ where }),
  ]);

  const rows: UpdateRow[] = rawRows.map((r) => ({
    id: r.id,
    start_date: r.start_date.toISOString(),
    end_date: r.end_date ? r.end_date.toISOString() : null,
    version: r.version,
    car_id: r.car_id,
    car_label: selectedCar?.label ?? `#${r.car_id}`,
  }));

  return (
    <>
      <AppHeader />
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
