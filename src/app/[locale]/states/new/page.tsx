import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { StateForm } from "@/components/entities/states/StateForm";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { createStateAction } from "../actions";

export default async function NewStatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("states");
  const tCommon = await getTranslations("common");

  const [cars, openStates] = await Promise.all([
    prisma.cars.findMany({
      select: { id: true, name: true, vin: true, model: true },
      orderBy: { id: "asc" },
    }),
    // Index des états ouverts (end_date IS NULL) pour informer le formulaire
    // d'un éventuel conflit lors du choix du véhicule.
    prisma.states.findMany({
      where: { end_date: null },
      select: { id: true, car_id: true },
    }),
  ]);

  const carOptions = cars.map((c) => ({
    id: c.id,
    label: c.name ?? c.vin ?? c.model ?? `#${c.id}`,
  }));
  const openStatesByCar: Record<number, number> = {};
  for (const s of openStates) openStatesByCar[s.car_id] = s.id;
  const defaultCar = carOptions[0]?.id ? String(carOptions[0].id) : "";

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/states">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("create")}</h1>
        </header>
        <StateForm
          mode="create"
          cars={carOptions}
          openStates={openStatesByCar}
          readOnly={env.READ_ONLY}
          saveAction={createStateAction}
          initial={{
            state: "",
            start_date: new Date().toISOString(),
            end_date: "",
            car_id: defaultCar,
            close_previous: false,
          }}
        />
      </main>
    </>
  );
}
