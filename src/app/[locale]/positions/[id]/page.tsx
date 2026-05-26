import { notFound } from "next/navigation";
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
import { updatePositionAction, deletePositionAction } from "../actions";
import { getSelectedTimezone } from "@/lib/timezone";
import { formatDateTimeIsoShort } from "@/lib/format/datetime";

const DRIVE_LIST_LIMIT = 200;

function carLabel(c: { id: number; name: string | null; vin: string | null; model: string | null }): string {
  return c.name ?? c.vin ?? c.model ?? `#${c.id}`;
}

function decimalString(v: { toString(): string } | null | undefined): string {
  return v == null ? "" : v.toString();
}
function boolStr(v: boolean | null): "true" | "false" | "" {
  if (v === true) return "true";
  if (v === false) return "false";
  return "";
}

export default async function PositionEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: idStr } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("positions");
  const tCommon = await getTranslations("common");

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const pos = await prisma.positions.findUnique({ where: { id } });
  if (!pos) notFound();

  const timeZone = await getSelectedTimezone();

  const [cars, drives, refByDrives, refByCharge] = await Promise.all([
    prisma.cars.findMany({
      select: { id: true, name: true, vin: true, model: true },
      orderBy: { id: "asc" },
    }),
    prisma.drives.findMany({
      where: { car_id: pos.car_id },
      orderBy: { id: "desc" },
      take: DRIVE_LIST_LIMIT,
      select: { id: true, start_date: true },
    }),
    prisma.drives.findMany({
      where: {
        OR: [{ start_position_id: id }, { end_position_id: id }],
      },
      select: { id: true },
    }),
    prisma.charging_processes.count({ where: { position_id: id } }),
  ]);

  const carOptions = cars.map((c) => ({ id: c.id, label: carLabel(c) }));
  const driveOptions = drives.map((d) => ({
    id: d.id,
    label: `#${d.id} — ${formatDateTimeIsoShort(d.start_date, timeZone)}`,
  }));
  // Si la position référence un drive hors top, on l'ajoute en tête.
  if (pos.drive_id != null && !driveOptions.some((d) => d.id === pos.drive_id)) {
    const refDrive = await prisma.drives.findUnique({
      where: { id: pos.drive_id },
      select: { id: true, start_date: true },
    });
    if (refDrive) {
      driveOptions.unshift({
        id: refDrive.id,
        label: `#${refDrive.id} — ${formatDateTimeIsoShort(refDrive.start_date, timeZone)}`,
      });
    }
  }

  const initial: PositionFormValues = {
    car_id: String(pos.car_id),
    drive_id: pos.drive_id != null ? String(pos.drive_id) : "",
    date: pos.date.toISOString(),
    latitude: pos.latitude.toString(),
    longitude: pos.longitude.toString(),
    speed: pos.speed != null ? String(pos.speed) : "",
    power: pos.power != null ? String(pos.power) : "",
    odometer: pos.odometer != null ? String(pos.odometer) : "",
    elevation: pos.elevation != null ? String(pos.elevation) : "",
    outside_temp: decimalString(pos.outside_temp),
    inside_temp: decimalString(pos.inside_temp),
    battery_level: pos.battery_level != null ? String(pos.battery_level) : "",
    usable_battery_level: pos.usable_battery_level != null ? String(pos.usable_battery_level) : "",
    ideal_battery_range_km: decimalString(pos.ideal_battery_range_km),
    rated_battery_range_km: decimalString(pos.rated_battery_range_km),
    est_battery_range_km: decimalString(pos.est_battery_range_km),
    fan_status: pos.fan_status != null ? String(pos.fan_status) : "",
    driver_temp_setting: decimalString(pos.driver_temp_setting),
    passenger_temp_setting: decimalString(pos.passenger_temp_setting),
    is_climate_on: boolStr(pos.is_climate_on),
    is_rear_defroster_on: boolStr(pos.is_rear_defroster_on),
    is_front_defroster_on: boolStr(pos.is_front_defroster_on),
    battery_heater: boolStr(pos.battery_heater),
    battery_heater_on: boolStr(pos.battery_heater_on),
    battery_heater_no_power: boolStr(pos.battery_heater_no_power),
    tpms_pressure_fl: decimalString(pos.tpms_pressure_fl),
    tpms_pressure_fr: decimalString(pos.tpms_pressure_fr),
    tpms_pressure_rl: decimalString(pos.tpms_pressure_rl),
    tpms_pressure_rr: decimalString(pos.tpms_pressure_rr),
  };

  const boundUpdate = updatePositionAction.bind(null, id);
  const boundDelete = deletePositionAction.bind(null, id);

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
          <h1 className="text-2xl font-semibold tracking-tight">{t("edit")}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">#{pos.id}</p>
        </header>
        <PositionForm
          mode="edit"
          id={pos.id}
          initial={initial}
          cars={carOptions}
          drives={driveOptions}
          referencedByCharge={refByCharge > 0}
          referencedByDrives={refByDrives.map((d) => d.id)}
          readOnly={env.READ_ONLY}
          saveAction={boundUpdate}
          deleteAction={boundDelete}
        />
      </main>
    </>
  );
}
