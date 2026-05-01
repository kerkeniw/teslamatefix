import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { AddressForm } from "@/components/entities/addresses/AddressForm";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { createAddressAction } from "../actions";

export default async function NewAddressPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("addresses");
  const tCommon = await getTranslations("common");

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/addresses" />}
          >
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </Button>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("create")}</h1>
        </header>
        <AddressForm
          mode="create"
          readOnly={env.READ_ONLY}
          saveAction={createAddressAction}
          initial={{
            display_name: "",
            name: "",
            house_number: "",
            road: "",
            neighbourhood: "",
            city: "",
            county: "",
            postcode: "",
            state: "",
            state_district: "",
            country: "",
            latitude: "",
            longitude: "",
            osm_id: "",
            osm_type: "",
            raw: "",
          }}
        />
      </main>
    </>
  );
}
