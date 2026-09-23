"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations, useFormatter } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";

export type ChargeRow = {
  id: number;
  start_date: string;
  end_date: string | null;
  car_id: number;
  car_label: string;
  place: string | null;
  charge_energy_added: number | null;
  duration_min: number | null;
  cost: number | null;
  fast_charger: boolean | null;
};

export function formatDuration(
  minutes: number | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (minutes == null) return "—";
  if (minutes < 60) return t("duration.minutes", { m: minutes });
  const hours = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (hours < 24) return t("duration.hours", { h: hours, m });
  const days = Math.floor(hours / 24);
  return t("duration.days", { d: days, h: hours % 24 });
}

export function useChargeColumns(): ColumnDef<ChargeRow>[] {
  const t = useTranslations("charges");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  return [
    {
      accessorKey: "id",
      header: tCommon("id"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: "start_date",
      header: t("fields.startDate"),
      cell: ({ row }) => (
        <Link
          href={`/charges/${row.original.id}`}
          className="font-mono text-xs tabular-nums text-primary underline-offset-4 hover:underline"
        >
          {format.dateTime(new Date(row.original.start_date), "short")}
        </Link>
      ),
    },
    {
      accessorKey: "place",
      header: t("fields.place"),
      cell: ({ row }) => row.original.place ?? "—",
    },
    {
      accessorKey: "charge_energy_added",
      header: t("fields.chargeEnergyAdded"),
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">
          {row.original.charge_energy_added != null
            ? `${row.original.charge_energy_added.toFixed(2)} kWh`
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "duration_min",
      header: t("fields.durationMin"),
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatDuration(row.original.duration_min, t)}
        </span>
      ),
    },
    {
      accessorKey: "cost",
      header: t("fields.cost"),
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">
          {row.original.cost != null ? row.original.cost.toFixed(2) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "fast_charger",
      header: t("fields.type"),
      cell: ({ row }) =>
        row.original.fast_charger === true ? (
          <Badge variant="secondary">{t("type.dc")}</Badge>
        ) : row.original.fast_charger === false ? (
          <Badge variant="outline">{t("type.ac")}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">{t("type.unknown")}</span>
        ),
    },
    {
      id: "status",
      header: "",
      cell: ({ row }) =>
        !row.original.end_date ? <Badge variant="secondary">{t("ongoing")}</Badge> : null,
    },
  ];
}
