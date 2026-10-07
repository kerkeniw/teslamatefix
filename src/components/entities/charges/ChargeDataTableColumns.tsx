"use client";

import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import { useTranslations, useFormatter } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { formatDurationHHMM } from "@/lib/format/duration";
import {
  kmToUnit,
  celsiusToUnit,
  lengthLabel,
  speedLabel,
  tempLabel,
  type LengthUnit,
  type TempUnit,
} from "@/lib/units";
import type { ChargeListRow } from "@/lib/charges/list-query";
import {
  avgPowerKw,
  chargeEfficiencyPct,
  costPerKwh,
  isSuspectEfficiency,
  isSuspectEnergy,
} from "@/lib/charges/metrics";

export type ChargeRow = ChargeListRow;

const mono = "font-mono tabular-nums";

function numCell(v: number | null, digits: number, suffix = "", warn = false) {
  return (
    <span className={`${mono}${warn ? " font-semibold text-warn" : ""}`}>
      {v == null || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}${suffix}`}
    </span>
  );
}

/** Colonnes brutes masquées par défaut (le reste = colonnes Grafana visibles). */
export const CHARGE_DEFAULT_VISIBILITY: VisibilityState = {
  start_ideal_range_km: false,
  end_ideal_range_km: false,
  start_rated_range_km: false,
  end_rated_range_km: false,
  address_id: false,
  geofence_id: false,
  position_id: false,
  end_date: false,
};

export function ChargeTypeBadge({ type }: { type: ChargeListRow["charge_type"] }) {
  const t = useTranslations("charges");
  if (type === "DC") return <Badge variant="secondary">{t("type.dc")}</Badge>;
  if (type === "AC") return <Badge variant="outline">{t("type.ac")}</Badge>;
  return <span className="text-xs text-muted-foreground">{t("type.unknown")}</span>;
}

export function useChargeColumns(opts: {
  length: LengthUnit;
  temp: TempUnit;
}): ColumnDef<ChargeRow>[] {
  const { length, temp } = opts;
  const t = useTranslations("charges");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  const lu = lengthLabel(length);
  const su = speedLabel(length);
  const tu = tempLabel(temp);

  const col = (
    id: string,
    label: string,
    cell: ColumnDef<ChargeRow>["cell"],
  ): ColumnDef<ChargeRow> => ({ id, header: label, cell, meta: { label } });

  const rangeCell = (v: number | null) => numCell(v != null ? kmToUnit(v, length) : null, 1);

  return [
    col("id", tCommon("id"), ({ row }) => (
      <span className="font-mono text-xs">{row.original.id}</span>
    )),
    col("date", t("columns.date"), ({ row }) => (
      <Link
        href={`/charges/${row.original.id}`}
        className={`${mono} text-xs text-primary underline-offset-4 hover:underline`}
      >
        {format.dateTime(new Date(row.original.start_date), "short")}
      </Link>
    )),
    col("place", t("columns.place"), ({ row }) => {
      const { place, geofence_id, address_id } = row.original;
      if (!place) return <span className="text-sm">—</span>;
      const href =
        geofence_id != null
          ? `/geofences/${geofence_id}`
          : address_id != null
            ? `/addresses/${address_id}`
            : null;
      return href ? (
        <Link
          href={href}
          title={place}
          className="block max-w-[220px] truncate text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {place}
        </Link>
      ) : (
        <span className="block max-w-[220px] truncate text-sm" title={place}>
          {place}
        </span>
      );
    }),
    col("charge_type", t("columns.type"), ({ row }) => (
      <ChargeTypeBadge type={row.original.charge_type} />
    )),
    col("duration_min", t("columns.duration"), ({ row }) => (
      <span className={`${mono} text-xs text-muted-foreground`}>
        {formatDurationHHMM(row.original.duration_min)}
      </span>
    )),
    col("cost", t("columns.cost"), ({ row }) => numCell(row.original.cost, 2)),
    col("cost_per_kwh", `${t("columns.costPerKwh")}`, ({ row }) =>
      numCell(costPerKwh(row.original), 3),
    ),
    col("charge_energy_added", `${t("columns.energyAdded")} (kWh)`, ({ row }) =>
      numCell(
        row.original.charge_energy_added,
        2,
        "",
        isSuspectEnergy(row.original.charge_energy_added),
      ),
    ),
    col("charge_energy_used", `${t("columns.energyUsed")} (kWh)`, ({ row }) =>
      numCell(
        row.original.charge_energy_used,
        2,
        "",
        isSuspectEnergy(row.original.charge_energy_used),
      ),
    ),
    col("efficiency", `${t("columns.efficiency")} (%)`, ({ row }) => {
      const eff = chargeEfficiencyPct(row.original);
      return numCell(eff, 0, "", isSuspectEfficiency(eff));
    }),
    col("outside_temp_avg", `${t("columns.outsideTemp")} (${tu})`, ({ row }) =>
      numCell(
        row.original.outside_temp_avg != null
          ? celsiusToUnit(row.original.outside_temp_avg, temp)
          : null,
        1,
      ),
    ),
    col("avg_power", `${t("columns.avgPower")} (kW)`, ({ row }) =>
      numCell(avgPowerKw(row.original), 1),
    ),
    col("charge_rate", `${t("columns.chargeRate")} (${su})`, ({ row }) => {
      const { range_added_km, duration_min } = row.original;
      const rate =
        range_added_km != null && duration_min != null && duration_min > 0
          ? kmToUnit((range_added_km * 60) / duration_min, length)
          : null;
      return numCell(rate, 0);
    }),
    col("range_added", `${t("columns.rangeAdded")} (${lu})`, ({ row }) =>
      numCell(
        row.original.range_added_km != null ? kmToUnit(row.original.range_added_km, length) : null,
        0,
      ),
    ),
    col("start_battery_level", t("columns.batteryStart"), ({ row }) =>
      numCell(row.original.start_battery_level, 0, " %"),
    ),
    col("end_battery_level", t("columns.batteryEnd"), ({ row }) =>
      numCell(row.original.end_battery_level, 0, " %"),
    ),
    col("odometer", `${t("columns.odometer")} (${lu})`, ({ row }) =>
      numCell(
        row.original.odometer_km != null ? kmToUnit(row.original.odometer_km, length) : null,
        0,
      ),
    ),

    // --- Colonnes brutes (masquées par défaut) ---
    col("end_date", t("columns.endDate"), ({ row }) => (
      <span className={`${mono} text-xs`}>
        {row.original.end_date ? format.dateTime(new Date(row.original.end_date), "short") : "—"}
      </span>
    )),
    col("start_ideal_range_km", `${t("columns.startIdealRange")} (${lu})`, ({ row }) =>
      rangeCell(row.original.start_ideal_range_km),
    ),
    col("end_ideal_range_km", `${t("columns.endIdealRange")} (${lu})`, ({ row }) =>
      rangeCell(row.original.end_ideal_range_km),
    ),
    col("start_rated_range_km", `${t("columns.startRatedRange")} (${lu})`, ({ row }) =>
      rangeCell(row.original.start_rated_range_km),
    ),
    col("end_rated_range_km", `${t("columns.endRatedRange")} (${lu})`, ({ row }) =>
      rangeCell(row.original.end_rated_range_km),
    ),
    col("address_id", t("columns.addressId"), ({ row }) => numCell(row.original.address_id, 0)),
    col("geofence_id", t("columns.geofenceId"), ({ row }) =>
      numCell(row.original.geofence_id, 0),
    ),
    col("position_id", t("columns.positionId"), ({ row }) =>
      numCell(row.original.position_id, 0),
    ),

    {
      id: "status",
      header: "",
      enableHiding: false,
      cell: ({ row }) =>
        !row.original.end_date ? <Badge variant="secondary">{t("ongoing")}</Badge> : null,
    },
  ];
}
