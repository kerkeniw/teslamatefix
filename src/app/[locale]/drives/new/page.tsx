import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { DriveCreateClient } from "@/components/entities/drives/DriveCreateClient";
import type {
  DriveFormValues,
  DriveFormInitialOptions,
} from "@/components/entities/drives/DriveForm";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { createDriveAction } from "../actions";

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

  const initial: DriveFormValues = {
    car_id: selectedCar ? String(selectedCar.id) : "",
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

  const initialOptions: DriveFormInitialOptions = {
    car: selectedCar
      ? { id: selectedCar.id, label: selectedCar.label }
      : { id: 0, label: "" },
    startAddress: null,
    endAddress: null,
    startGeofence: null,
    endGeofence: null,
  };

  return (
    <>
      <AppHeader />
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
          initialOptions={initialOptions}
          hasCar={selectedCar != null}
          readOnly={env.READ_ONLY}
          createAction={createDriveAction}
        />
      </main>
    </>
  );
}
