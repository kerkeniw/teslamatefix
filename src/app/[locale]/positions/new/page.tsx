import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import {
  PositionForm,
  type PositionFormValues,
} from "@/components/entities/positions/PositionForm";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { createPositionAction } from "../actions";
import { getSelectedTimezone } from "@/lib/timezone";
import { formatDateTimeIsoShort } from "@/lib/format/datetime";

const DRIVE_LIST_LIMIT = 200;

function carLabel(c: { id: number; name: string | null; vin: string | null; model: string | null }): string {
  return c.name ?? c.vin ?? c.model ?? `#${c.id}`;
}

export default async function NewPositionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const timeZone = await getSelectedTimezone();
  const t = await getTranslations("positions");
  const tCommon = await getTranslations("common");

  const [cars, drives] = await Promise.all([
    prisma.cars.findMany({
      select: { id: true, name: true, vin: true, model: true },
      orderBy: { id: "asc" },
    }),
    prisma.drives.findMany({
      orderBy: { id: "desc" },
      take: DRIVE_LIST_LIMIT,
      select: { id: true, start_date: true },
    }),
  ]);

  const carOptions = cars.map((c) => ({ id: c.id, label: carLabel(c) }));
  const driveOptions = drives.map((d) => ({
    id: d.id,
    label: `#${d.id} — ${formatDateTimeIsoShort(d.start_date, timeZone)}`,
  }));

  const initial: PositionFormValues = {
    car_id: carOptions[0]?.id ? String(carOptions[0].id) : "",
    drive_id: "",
    date: new Date().toISOString(),
    latitude: "",
    longitude: "",
    speed: "",
    power: "",
    odometer: "",
    elevation: "",
    outside_temp: "",
    inside_temp: "",
    battery_level: "",
    usable_battery_level: "",
    ideal_battery_range_km: "",
    rated_battery_range_km: "",
    est_battery_range_km: "",
    fan_status: "",
    driver_temp_setting: "",
    passenger_temp_setting: "",
    is_climate_on: "",
    is_rear_defroster_on: "",
    is_front_defroster_on: "",
    battery_heater: "",
    battery_heater_on: "",
    battery_heater_no_power: "",
    tpms_pressure_fl: "",
    tpms_pressure_fr: "",
    tpms_pressure_rl: "",
    tpms_pressure_rr: "",
  };

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/positions">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("create")}</h1>
        </header>
        <PositionForm
          mode="create"
          initial={initial}
          cars={carOptions}
          drives={driveOptions}
          readOnly={env.READ_ONLY}
          saveAction={createPositionAction}
        />
      </main>
    </>
  );
}
