import { Prisma } from "@prisma/client";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { AddressListClient } from "@/components/entities/addresses/AddressListClient";
import type { AddressRow } from "@/components/entities/addresses/AddressDataTableColumns";

type SP = { page?: string; pageSize?: string; q?: string };

function parsePage(v?: string) {
  const n = v ? parseInt(v, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function parsePageSize(v?: string) {
  const n = v ? parseInt(v, 10) : 25;
  return [25, 50, 100].includes(n) ? n : 25;
}

export default async function AddressesPage({
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
  const t = await getTranslations("addresses");

  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const q = (sp.q ?? "").trim();

  const where: Prisma.addressesWhereInput = q
    ? {
        OR: [
          { display_name: { contains: q, mode: "insensitive" } },
          { road: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
          { country: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [rawRows, total] = await Promise.all([
    prisma.addresses.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        display_name: true,
        road: true,
        city: true,
        postcode: true,
        country: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.addresses.count({ where }),
  ]);

  const rows: AddressRow[] = rawRows.map((r) => ({
    id: r.id,
    display_name: r.display_name,
    road: r.road,
    city: r.city,
    postcode: r.postcode,
    country: r.country,
    latitude: r.latitude ? r.latitude.toString() : null,
    longitude: r.longitude ? r.longitude.toString() : null,
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
        <AddressListClient
          data={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          initialQuery={q}
        />
      </main>
    </>
  );
}
