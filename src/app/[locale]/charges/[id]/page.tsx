import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { getSelectedCarOrDefault } from "@/lib/vehicle";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { ChargeTabs } from "@/components/entities/charges/ChargeTabs";
import { TicksTable, type TickRow } from "@/components/entities/charges/TicksTable";
import { ChargeRecalcPanel } from "@/components/entities/charges/RecalcPanel";
import type {
  ChargeProcessFormValues,
  ChargeProcessFormInitialOptions,
} from "@/components/entities/charges/ChargeProcessForm";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import type { FKOption } from "@/components/form/fk-combobox";
import {
  updateChargeAction,
  deleteChargeAction,
  deleteTickAction,
  recalcChargeAction,
  applyRecalcChargeAction,
} from "../actions";

function addressLabel(a: {
  id: number;
  display_name: string | null;
  city: string | null;
  road: string | null;
  country: string | null;
}): string {
  const parts = [a.road, a.city, a.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : (a.display_name ?? `#${a.id}`);
}
function decimalString(v: { toString(): string } | null | undefined): string {
  return v == null ? "" : v.toString();
}

type TicksSP = { tcursor?: string; tdir?: string; tps?: string };

function parseTickPageSize(v?: string) {
  const n = v ? parseInt(v, 10) : 50;
  return [25, 50, 100].includes(n) ? n : 50;
}

export default async function ChargeEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<TicksSP>;
}) {
  const { locale, id: idStr } = await params;
  setRequestLocale(locale);
  await requireSession();
  const sp = await searchParams;
  const t = await getTranslations("charges");
  const tCommon = await getTranslations("common");

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const [proc, selectedCar] = await Promise.all([
    prisma.charging_processes.findUnique({ where: { id } }),
    getSelectedCarOrDefault(),
  ]);
  if (!proc || !selectedCar) notFound();

  const tickPageSize = parseTickPageSize(sp.tps);
  const cursor = sp.tcursor && /^\d+$/.test(sp.tcursor) ? parseInt(sp.tcursor, 10) : null;
  const direction = sp.tdir === "prev" ? "prev" : "next";

  // Pagination cursor sur charges (ticks). On commande par id desc (équivalent
  // date desc en pratique car id auto-increment monotone). On lit pageSize+1
  // pour détecter une page suivante.
  const ticksWhere: Prisma.chargesWhereInput = { charging_process_id: id };
  if (cursor != null) {
    if (direction === "next") ticksWhere.id = { lt: cursor };
    else ticksWhere.id = { gt: cursor };
  }

  const [ticksRaw, ticksTotal, refPosition, refAddress, refGeofence] = await Promise.all([
    prisma.charges.findMany({
      where: ticksWhere,
      orderBy: { id: direction === "prev" ? "asc" : "desc" },
      take: tickPageSize + 1,
      select: {
        id: true,
        date: true,
        battery_level: true,
        charge_energy_added: true,
        charger_power: true,
        charger_voltage: true,
        charger_actual_current: true,
        charger_phases: true,
        fast_charger_present: true,
      },
    }),
    prisma.charges.count({ where: { charging_process_id: id } }),
    prisma.positions.findUnique({
      where: { id: proc.position_id },
      select: { id: true, date: true, latitude: true, longitude: true },
    }),
    proc.address_id
      ? prisma.addresses.findUnique({
          where: { id: proc.address_id },
          select: {
            id: true,
            display_name: true,
            city: true,
            road: true,
            country: true,
          },
        })
      : Promise.resolve(null),
    proc.geofence_id
      ? prisma.geofences.findUnique({
          where: { id: proc.geofence_id },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  const positionOption: FKOption | null = refPosition
    ? {
        id: refPosition.id,
        label: `#${refPosition.id} · ${refPosition.date.toISOString().slice(0, 16).replace("T", " ")} (${Number(refPosition.latitude).toFixed(4)}, ${Number(refPosition.longitude).toFixed(4)})`,
      }
    : null;
  const addressOption: FKOption | null = refAddress
    ? { id: refAddress.id, label: addressLabel(refAddress) }
    : null;
  const geofenceOption: FKOption | null = refGeofence
    ? { id: refGeofence.id, label: refGeofence.name }
    : null;

  const initial: ChargeProcessFormValues = {
    car_id: String(proc.car_id),
    position_id: String(proc.position_id),
    start_date: proc.start_date.toISOString(),
    end_date: proc.end_date ? proc.end_date.toISOString() : "",
    charge_energy_added: decimalString(proc.charge_energy_added),
    charge_energy_used: decimalString(proc.charge_energy_used),
    cost: decimalString(proc.cost),
    start_battery_level: proc.start_battery_level != null ? String(proc.start_battery_level) : "",
    end_battery_level: proc.end_battery_level != null ? String(proc.end_battery_level) : "",
    start_ideal_range_km: decimalString(proc.start_ideal_range_km),
    end_ideal_range_km: decimalString(proc.end_ideal_range_km),
    start_rated_range_km: decimalString(proc.start_rated_range_km),
    end_rated_range_km: decimalString(proc.end_rated_range_km),
    address_id: proc.address_id != null ? String(proc.address_id) : "",
    geofence_id: proc.geofence_id != null ? String(proc.geofence_id) : "",
    outside_temp_avg: decimalString(proc.outside_temp_avg),
  };

  const initialOptions: ChargeProcessFormInitialOptions = {
    car: { id: selectedCar.id, label: selectedCar.label },
    position: positionOption,
    address: addressOption,
    geofence: geofenceOption,
  };

  // Pagination cursor : trim à pageSize, calcule hasMore et hasPrev.
  const hasMore = ticksRaw.length > tickPageSize;
  const trimmed = hasMore ? ticksRaw.slice(0, tickPageSize) : ticksRaw;
  const ordered = direction === "prev" ? [...trimmed].reverse() : trimmed;

  const ticks: TickRow[] = ordered.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    battery_level: t.battery_level ?? null,
    charge_energy_added: t.charge_energy_added.toString(),
    charger_power: t.charger_power,
    charger_voltage: t.charger_voltage ?? null,
    charger_actual_current: t.charger_actual_current ?? null,
    charger_phases: t.charger_phases ?? null,
    fast_charger_present: t.fast_charger_present ?? null,
  }));

  const firstId = ticks.length > 0 ? ticks[0].id : null;
  const lastId = ticks.length > 0 ? ticks[ticks.length - 1].id : null;
  const hasNext = direction === "prev" ? cursor != null : hasMore;
  const hasPrev = direction === "prev" ? hasMore : cursor != null;

  const boundUpdate = updateChargeAction.bind(null, id);
  const boundDelete = deleteChargeAction.bind(null, id);

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/charges">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("edit")}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">#{proc.id}</p>
        </header>
        <ChargeTabs
          id={proc.id}
          initial={initial}
          initialOptions={initialOptions}
          ticksCount={ticksTotal}
          readOnly={env.READ_ONLY}
          saveAction={boundUpdate}
          deleteAction={boundDelete}
          ticksTab={
            <TicksTable
              ticks={ticks}
              total={ticksTotal}
              firstId={firstId}
              lastId={lastId}
              hasNext={hasNext}
              hasPrev={hasPrev}
              pageSize={tickPageSize}
              deleteTickAction={deleteTickAction}
              readOnly={env.READ_ONLY}
            />
          }
          recalcTab={
            <ChargeRecalcPanel
              processId={proc.id}
              computeAction={recalcChargeAction}
              applyAction={applyRecalcChargeAction}
              readOnly={env.READ_ONLY}
            />
          }
        />
      </main>
    </>
  );
}
