import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { CarEditClient } from "@/components/entities/cars/CarEditClient";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { updateCarAction } from "../actions";

export default async function CarEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: idStr } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("cars");
  const tCommon = await getTranslations("common");

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const car = await prisma.cars.findUnique({
    where: { id },
    include: { car_settings: true },
  });
  if (!car) notFound();

  const boundUpdate = updateCarAction.bind(null, id);

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/cars">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {car.name ?? car.marketing_name ?? car.model ?? t("edit")}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">#{car.id}</p>
        </header>
        <CarEditClient
          id={car.id}
          readOnly={env.READ_ONLY}
          saveAction={boundUpdate}
          carInitial={{
            name: car.name ?? "",
            vin: car.vin ?? "",
            eid: car.eid.toString(),
            vid: car.vid.toString(),
            model: car.model ?? "",
            marketing_name: car.marketing_name ?? "",
            trim_badging: car.trim_badging ?? "",
            exterior_color: car.exterior_color ?? "",
            spoiler_type: car.spoiler_type ?? "",
            wheel_type: car.wheel_type ?? "",
            display_priority: String(car.display_priority),
            efficiency: car.efficiency != null ? String(car.efficiency) : "",
          }}
          settingsInitial={{
            suspend_min: String(car.car_settings.suspend_min),
            suspend_after_idle_min: String(car.car_settings.suspend_after_idle_min),
            req_not_unlocked: car.car_settings.req_not_unlocked,
            free_supercharging: car.car_settings.free_supercharging,
            use_streaming_api: car.car_settings.use_streaming_api,
            enabled: car.car_settings.enabled,
            lfp_battery: car.car_settings.lfp_battery,
          }}
        />
      </main>
    </>
  );
}
