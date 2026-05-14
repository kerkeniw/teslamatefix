"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations, useFormatter } from "next-intl";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";

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
      cell: ({ row }) => format.dateTime(new Date(row.original.start_date), "short"),
    },
    {
      accessorKey: "place",
      header: t("fields.place"),
      cell: ({ row }) => row.original.place ?? "—",
    },
    {
      accessorKey: "charge_energy_added",
      header: t("fields.chargeEnergyAdded"),
      cell: ({ row }) =>
        row.original.charge_energy_added != null
          ? `${row.original.charge_energy_added.toFixed(2)} kWh`
          : "—",
    },
    {
      accessorKey: "duration_min",
      header: t("fields.durationMin"),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDuration(row.original.duration_min, t)}
        </span>
      ),
    },
    {
      accessorKey: "cost",
      header: t("fields.cost"),
      cell: ({ row }) =>
        row.original.cost != null ? row.original.cost.toFixed(2) : "—",
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
    {
      id: "actions",
      header: () => <span className="sr-only">{tCommon("actions")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <ButtonLink
            variant="ghost"
            size="icon-sm"
            href={`/charges/${row.original.id}`}
            aria-label={tCommon("edit")}
          >
            <Pencil className="size-3.5" aria-hidden />
          </ButtonLink>
        </div>
      ),
    },
  ];
}
