import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { z } from "zod";
import {
  ChargeCreateWizard,
  type ChargeCreatePrefill,
} from "@/components/entities/charges/ChargeCreateWizard";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { createChargeWithTicksAction } from "../actions";

// Pré-remplissage optionnel depuis l'URL (lien « Créer la charge » du rapport Privacy).
const PrefillSchema = z.object({
  start: z.iso.datetime().optional(),
  end: z.iso.datetime().optional(),
  added: z.coerce.number().nonnegative().max(1000).optional(),
  type: z.enum(["AC", "DC"]).optional(),
});

function parsePrefill(sp: Record<string, string | string[] | undefined>): ChargeCreatePrefill | undefined {
  const parsed = PrefillSchema.safeParse(sp);
  if (!parsed.success) return undefined;
  const { start, end, added, type } = parsed.data;
  if (!start && !end && added == null && !type) return undefined;
  return {
    ...(start ? { start_date: start } : {}),
    ...(end ? { end_date: end } : {}),
    ...(added != null ? { charge_energy_added: String(added) } : {}),
    ...(type ? { charger_type: type } : {}),
  };
}

export default async function NewChargePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("charges");
  const tCommon = await getTranslations("common");

  const selectedCar = await getSelectedCarOrDefault();
  const prefill = parsePrefill(await searchParams);

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
          prefill={prefill}
        />
      </main>
    </>
  );
}
