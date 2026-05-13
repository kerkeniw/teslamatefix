import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { UpdateForm } from "@/components/entities/updates/UpdateForm";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { createUpdateAction } from "../actions";

export default async function NewUpdatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("updates");
  const tCommon = await getTranslations("common");

  const cars = await prisma.cars.findMany({
    select: { id: true, name: true, vin: true, model: true },
    orderBy: { id: "asc" },
  });

  const carOptions = cars.map((c) => ({
    id: c.id,
    label: c.name ?? c.vin ?? c.model ?? `#${c.id}`,
  }));

  const defaultCar = carOptions[0]?.id ? String(carOptions[0].id) : "";

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/updates">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("create")}</h1>
        </header>
        <UpdateForm
          mode="create"
          cars={carOptions}
          readOnly={env.READ_ONLY}
          saveAction={createUpdateAction}
          initial={{
            start_date: new Date().toISOString(),
            end_date: "",
            version: "",
            car_id: defaultCar,
          }}
        />
      </main>
    </>
  );
}
