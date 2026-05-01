import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { GeofenceForm } from "@/components/entities/geofences/GeofenceForm";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { createGeofenceAction } from "../actions";

export default async function NewGeofencePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("geofences");
  const tCommon = await getTranslations("common");

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <Button variant="ghost" size="sm" render={<Link href="/geofences" />}>
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </Button>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("create")}</h1>
        </header>
        <GeofenceForm
          mode="create"
          readOnly={env.READ_ONLY}
          saveAction={createGeofenceAction}
          initial={{
            name: "",
            latitude: "",
            longitude: "",
            radius: "25",
            billing_type: "per_kwh",
            cost_per_unit: "",
            session_fee: "",
          }}
        />
      </main>
    </>
  );
}
