import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { AddressForm } from "@/components/entities/addresses/AddressForm";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { updateAddressAction, deleteAddressAction } from "../actions";

export default async function AddressEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: idStr } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("addresses");
  const tCommon = await getTranslations("common");

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const [address, drivesCount, chargingCount] = await Promise.all([
    prisma.addresses.findUnique({ where: { id } }),
    prisma.drives.count({
      where: {
        OR: [{ start_address_id: id }, { end_address_id: id }],
      },
    }),
    prisma.charging_processes.count({ where: { address_id: id } }),
  ]);

  if (!address) notFound();

  const boundUpdate = updateAddressAction.bind(null, id);
  const boundDelete = deleteAddressAction.bind(null, id);

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <Button variant="ghost" size="sm" render={<Link href="/addresses" />}>
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </Button>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("edit")}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">#{address.id}</p>
        </header>
        <AddressForm
          mode="edit"
          id={address.id}
          drivesCount={drivesCount}
          chargingCount={chargingCount}
          readOnly={env.READ_ONLY}
          saveAction={boundUpdate}
          deleteAction={boundDelete}
          initial={{
            display_name: address.display_name,
            name: address.name,
            house_number: address.house_number,
            road: address.road,
            neighbourhood: address.neighbourhood,
            city: address.city,
            county: address.county,
            postcode: address.postcode,
            state: address.state,
            state_district: address.state_district,
            country: address.country,
            latitude: address.latitude ? address.latitude.toString() : "",
            longitude: address.longitude ? address.longitude.toString() : "",
            osm_id: address.osm_id ? address.osm_id.toString() : "",
            osm_type: address.osm_type ?? "",
            raw: address.raw ? JSON.stringify(address.raw, null, 2) : "",
          }}
        />
      </main>
    </>
  );
}
