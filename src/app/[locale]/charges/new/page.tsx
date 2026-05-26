import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { ChargeCreateWizard } from "@/components/entities/charges/ChargeCreateWizard";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { createChargeWithTicksAction } from "../actions";

export default async function NewChargePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("charges");
  const tCommon = await getTranslations("common");

  const selectedCar = await getSelectedCarOrDefault();

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/charges">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("create.title")}</h1>
        </header>
        <ChargeCreateWizard
          car={selectedCar ? { id: selectedCar.id, label: selectedCar.label } : null}
          hasCar={selectedCar != null}
          readOnly={env.READ_ONLY}
          createAction={createChargeWithTicksAction}
        />
      </main>
    </>
  );
}
