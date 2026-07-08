import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { DriveCreateClient } from "@/components/entities/drives/DriveCreateClient";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";

export default async function NewDrivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("drives");
  const tCommon = await getTranslations("common");

  const selectedCar = await getSelectedCarOrDefault();

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/drives">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("create")}</h1>
        </header>
        <DriveCreateClient
          carId={selectedCar ? selectedCar.id : null}
          carLabel={selectedCar ? selectedCar.label : ""}
          hasCar={selectedCar != null}
          readOnly={env.READ_ONLY}
        />
      </main>
    </>
  );
}
