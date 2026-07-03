"use client";

import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import { useTranslations, useFormatter } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { formatDurationHHMM } from "@/lib/format/duration";
import {
  kmToUnit,
  kmhToUnit,
  celsiusToUnit,
  lengthLabel,
  speedLabel,
  tempLabel,
  consumptionLabel,
  type LengthUnit,
  type TempUnit,
} from "@/lib/units";
import type { DriveListRow } from "@/lib/drives/list-query";

export type DriveRow = DriveListRow;
export type EfficiencyMode = "slope" | "distance";

// Re-export pour compat (anciens imports `formatDuration` depuis ce module).
export { formatDuration } from "@/lib/format/duration";

/** Efficacité (%) selon le mode, façon dashboard Grafana. `null` si non calculable. */
function efficiencyPercent(row: DriveRow, mode: EfficiencyMode): number | null {
  const { distance, range_diff, car_efficiency, ascent, descent } = row;
  if (distance == null || range_diff == null) return null;
  if (mode === "distance") {
    if (range_diff <= 0) return null;
    return (distance / range_diff) * 100;
  }
  // slope-adjusted (masse 2100 kg, g = 9.81, rendement 0.85 sur la descente)
  if (car_efficiency == null) return null;
  const asc = ascent ?? 0;
  const desc = descent ?? 0;
  const actualEnergy =
    range_diff * car_efficiency +
    (2100 * 0.85 * 9.81 * desc) / 3600 / 1000 -
    (2100 * 9.81 * asc) / 3600 / 1000;
  if (actualEnergy === 0) return null;
  return ((distance * car_efficiency) / actualEnergy) * 100;
}

function consumptionKwh(row: DriveRow): number | null {
  if (row.range_diff == null || row.car_efficiency == null) return null;
  return row.range_diff * row.car_efficiency;
}

const mono = "font-mono tabular-nums";

/** Lien vers l'entité correspondante : géofence prioritaire (source du libellé), sinon adresse. */
function entityHref(geofenceId: number | null, addressId: number | null): string | null {
  if (geofenceId != null) return `/geofences/${geofenceId}`;
  if (addressId != null) return `/addresses/${addressId}`;
  return null;
}

function AddressCell({ label, href }: { label: string | null; href: string | null }) {
  if (!label) return <span className="text-sm">—</span>;
  if (!href) {
    return (
      <span className="block max-w-[220px] truncate text-sm" title={label}>
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      title={label}
      className="block max-w-[220px] truncate text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {label}
    </Link>
  );
}

function numCell(v: number | null, digits: number, suffix = "") {
  return (
    <span className={mono}>
      {v == null || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}${suffix}`}
    </span>
  );
}

/** Colonnes brutes masquées par défaut (le reste = colonnes Grafana visibles). */
export const DRIVE_DEFAULT_VISIBILITY: VisibilityState = {
  start_km: false,
  end_km: false,
  inside_temp_avg: false,
  power_min: false,
  ascent: false,
  descent: false,
  start_ideal_range_km: false,
  end_ideal_range_km: false,
  start_rated_range_km: false,
  end_rated_range_km: false,
  start_address_id: false,
  end_address_id: false,
  start_geofence_id: false,
  end_geofence_id: false,
  start_position_id: false,
  end_position_id: false,
};

export function useDriveColumns(opts: {
  length: LengthUnit;
  temp: TempUnit;
  efficiencyMode: EfficiencyMode;
}): ColumnDef<DriveRow>[] {
  const { length, temp, efficiencyMode } = opts;
  const t = useTranslations("drives");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  const lu = lengthLabel(length);
  const su = speedLabel(length);
  const tu = tempLabel(temp);
  const cu = consumptionLabel(length);

  const col = (
    id: string,
    label: string,
    cell: ColumnDef<DriveRow>["cell"],
  ): ColumnDef<DriveRow> => ({ id, header: label, cell, meta: { label } });

  return [
    col("id", tCommon("id"), ({ row }) => (
      <span className="font-mono text-xs">{row.original.id}</span>
    )),
    col("date", t("columns.date"), ({ row }) => (
      <Link
        href={`/drives/${row.original.id}`}
        className={`${mono} text-xs text-primary underline-offset-4 hover:underline`}
      >
        {format.dateTime(new Date(row.original.start_date), "short")}
      </Link>
    )),
    col("start_address", t("columns.start"), ({ row }) => (
      <AddressCell
        label={row.original.start_address}
        href={entityHref(row.original.start_geofence_id, row.original.start_address_id)}
      />
    )),
    col("end_address", t("columns.destination"), ({ row }) => (
      <AddressCell
        label={row.original.end_address}
        href={entityHref(row.original.end_geofence_id, row.original.end_address_id)}
      />
    )),
    col("duration_min", t("columns.duration"), ({ row }) => (
      <span className={`${mono} text-xs text-muted-foreground`}>
        {formatDurationHHMM(row.original.duration_min)}
      </span>
    )),
    col("distance", `${t("columns.distance")} (${lu})`, ({ row }) =>
      numCell(
        row.original.distance != null ? kmToUnit(row.original.distance, length) : null,
        1,
      ),
    ),
    col("start_battery_level", t("columns.batteryStart"), ({ row }) =>
      numCell(row.original.start_battery_level, 0, " %"),
    ),
    col("end_battery_level", t("columns.batteryEnd"), ({ row }) =>
      numCell(row.original.end_battery_level, 0, " %"),
    ),
    col("efficiency", `${t("columns.efficiency")} (%)`, ({ row }) =>
      numCell(efficiencyPercent(row.original, efficiencyMode), 0),
    ),
    col("consumption_kwh", `${t("columns.consumption")} (kWh)`, ({ row }) =>
      numCell(consumptionKwh(row.original), 1),
    ),
    col("consumption_per", `${t("columns.consumptionPer")} (${cu})`, ({ row }) => {
      const kwh = consumptionKwh(row.original);
      const dist = row.original.distance;
      const distUnit = dist != null ? kmToUnit(dist, length) : null;
      const per = kwh != null && distUnit != null && distUnit > 0 ? (kwh / distUnit) * 1000 : null;
      return numCell(per, 0);
    }),
    col("outside_temp_avg", `${t("columns.outsideTemp")} (${tu})`, ({ row }) =>
      numCell(
        row.original.outside_temp_avg != null
          ? celsiusToUnit(row.original.outside_temp_avg, temp)
          : null,
        1,
      ),
    ),
    col("avg_speed", `${t("columns.avgSpeed")} (${su})`, ({ row }) =>
      numCell(
        row.original.avg_speed != null ? kmhToUnit(row.original.avg_speed, length) : null,
        0,
      ),
    ),
    col("speed_max", `${t("columns.speedMax")} (${su})`, ({ row }) =>
      numCell(
        row.original.speed_max != null ? kmhToUnit(row.original.speed_max, length) : null,
        0,
      ),
    ),
    col("power_max", `${t("columns.powerMax")} (kW)`, ({ row }) =>
      numCell(row.original.power_max, 0),
    ),
    col("has_reduced_range", t("columns.reducedRange"), ({ row }) => (
      <span className="text-sm" title={t("columns.reducedRange")}>
        {row.original.has_reduced_range ? "❄" : "—"}
      </span>
    )),

    // --- Colonnes brutes « non interprétées » (masquées par défaut) ---
    col("start_km", `${t("columns.startKm")} (${lu})`, ({ row }) =>
      numCell(row.original.start_km != null ? kmToUnit(row.original.start_km, length) : null, 0),
    ),
    col("end_km", `${t("columns.endKm")} (${lu})`, ({ row }) =>
      numCell(row.original.end_km != null ? kmToUnit(row.original.end_km, length) : null, 0),
    ),
    col("inside_temp_avg", `${t("columns.insideTemp")} (${tu})`, ({ row }) =>
      numCell(
        row.original.inside_temp_avg != null
          ? celsiusToUnit(row.original.inside_temp_avg, temp)
          : null,
        1,
      ),
    ),
    col("power_min", `${t("columns.powerMin")} (kW)`, ({ row }) =>
      numCell(row.original.power_min, 0),
    ),
    col("ascent", `${t("columns.ascent")} (m)`, ({ row }) => numCell(row.original.ascent, 0)),
    col("descent", `${t("columns.descent")} (m)`, ({ row }) => numCell(row.original.descent, 0)),
    col("start_ideal_range_km", `${t("columns.startIdealRange")} (${lu})`, ({ row }) =>
      numCell(
        row.original.start_ideal_range_km != null
          ? kmToUnit(row.original.start_ideal_range_km, length)
          : null,
        1,
      ),
    ),
    col("end_ideal_range_km", `${t("columns.endIdealRange")} (${lu})`, ({ row }) =>
      numCell(
        row.original.end_ideal_range_km != null
          ? kmToUnit(row.original.end_ideal_range_km, length)
          : null,
        1,
      ),
    ),
    col("start_rated_range_km", `${t("columns.startRatedRange")} (${lu})`, ({ row }) =>
      numCell(
        row.original.start_rated_range_km != null
          ? kmToUnit(row.original.start_rated_range_km, length)
          : null,
        1,
      ),
    ),
    col("end_rated_range_km", `${t("columns.endRatedRange")} (${lu})`, ({ row }) =>
      numCell(
        row.original.end_rated_range_km != null
          ? kmToUnit(row.original.end_rated_range_km, length)
          : null,
        1,
      ),
    ),
    col("start_address_id", t("columns.startAddressId"), ({ row }) =>
      numCell(row.original.start_address_id, 0),
    ),
    col("end_address_id", t("columns.endAddressId"), ({ row }) =>
      numCell(row.original.end_address_id, 0),
    ),
    col("start_geofence_id", t("columns.startGeofenceId"), ({ row }) =>
      numCell(row.original.start_geofence_id, 0),
    ),
    col("end_geofence_id", t("columns.endGeofenceId"), ({ row }) =>
      numCell(row.original.end_geofence_id, 0),
    ),
    col("start_position_id", t("columns.startPositionId"), ({ row }) =>
      numCell(row.original.start_position_id, 0),
    ),
    col("end_position_id", t("columns.endPositionId"), ({ row }) =>
      numCell(row.original.end_position_id, 0),
    ),

    {
      id: "status",
      header: "",
      enableHiding: false,
      cell: ({ row }) =>
        !row.original.end_date ? (
          <Badge variant="secondary">{t("ongoing")}</Badge>
        ) : null,
    },
  ];
}
