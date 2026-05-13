import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { DriveCreateClient } from "@/components/entities/drives/DriveCreateClient";
import type { DriveFormValues } from "@/components/entities/drives/DriveForm";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { createDriveAction } from "../actions";

const FK_LIST_LIMIT = 200;

function carLabel(c: { id: number; name: string | null; vin: string | null; model: string | null }): string {
  return c.name ?? c.vin ?? c.model ?? `#${c.id}`;
}
function addressLabel(a: {
  id: number;
  display_name: string | null;
  city: string | null;
  road: string | null;
}): string {
  return a.display_name ?? a.city ?? a.road ?? `#${a.id}`;
}

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

  const [cars, addresses, geofences] = await Promise.all([
    prisma.cars.findMany({
      select: { id: true, name: true, vin: true, model: true },
      orderBy: { id: "asc" },
    }),
    prisma.addresses.findMany({
      select: { id: true, display_name: true, city: true, road: true },
      orderBy: { id: "desc" },
      take: FK_LIST_LIMIT,
    }),
    prisma.geofences.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
      take: FK_LIST_LIMIT,
    }),
  ]);

  const carOptions = cars.map((c) => ({ id: c.id, label: carLabel(c) }));
  const addressOptions = addresses.map((a) => ({ id: a.id, label: addressLabel(a) }));
  const geofenceOptions = geofences.map((g) => ({ id: g.id, label: g.name }));

  const initial: DriveFormValues = {
    car_id: carOptions[0]?.id ? String(carOptions[0].id) : "",
    start_date: new Date().toISOString(),
    end_date: "",
    start_km: "",
    end_km: "",
    distance: "",
    duration_min: "",
    start_address_id: "",
    end_address_id: "",
    start_geofence_id: "",
    end_geofence_id: "",
    start_ideal_range_km: "",
    end_ideal_range_km: "",
    start_rated_range_km: "",
    end_rated_range_km: "",
    outside_temp_avg: "",
    inside_temp_avg: "",
    speed_max: "",
    power_min: "",
    power_max: "",
    ascent: "",
    descent: "",
  };

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
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
          initial={initial}
          cars={carOptions}
          addresses={addressOptions}
          geofences={geofenceOptions}
          readOnly={env.READ_ONLY}
          createAction={createDriveAction}
        />
      </main>
    </>
  );
}
