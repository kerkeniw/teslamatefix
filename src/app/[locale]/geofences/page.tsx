import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { GeofenceListClient } from "@/components/entities/geofences/GeofenceListClient";
import type { GeofenceRow } from "@/components/entities/geofences/GeofenceDataTableColumns";

type SP = { page?: string; pageSize?: string };

function parsePage(v?: string) {
  const n = v ? parseInt(v, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function parsePageSize(v?: string) {
  const n = v ? parseInt(v, 10) : 25;
  return [25, 50, 100].includes(n) ? n : 25;
}

export default async function GeofencesPage({
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
  const t = await getTranslations("geofences");

  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);

  const [rawRows, total] = await Promise.all([
    prisma.geofences.findMany({
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        radius: true,
        billing_type: true,
        cost_per_unit: true,
        session_fee: true,
      },
    }),
    prisma.geofences.count(),
  ]);

  const rows: GeofenceRow[] = rawRows.map((r) => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude.toString(),
    longitude: r.longitude.toString(),
    radius: r.radius,
    billing_type: r.billing_type,
    cost_per_unit: r.cost_per_unit ? r.cost_per_unit.toString() : null,
    session_fee: r.session_fee ? r.session_fee.toString() : null,
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
        <GeofenceListClient
          data={rows}
          total={total}
          page={page}
          pageSize={pageSize}
        />
      </main>
    </>
  );
}
