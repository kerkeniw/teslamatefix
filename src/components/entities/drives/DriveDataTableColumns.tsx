"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations, useFormatter } from "next-intl";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";

export type DriveRow = {
  id: number;
  start_date: string;
  end_date: string | null;
  car_id: number;
  car_label: string;
  origin: string | null;
  destination: string | null;
  distance: number | null;
  duration_min: number | null;
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

export function useDriveColumns(): ColumnDef<DriveRow>[] {
  const t = useTranslations("drives");
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
        <span className="font-mono text-xs tabular-nums">
          {format.dateTime(new Date(row.original.start_date), "short")}
        </span>
      ),
    },
    {
      id: "route",
      header: () => `${t("fields.origin")} → ${t("fields.destination")}`,
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.origin ?? "—"}
          <span className="mx-1 text-muted-foreground">→</span>
          {row.original.destination ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "distance",
      header: t("fields.distance"),
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">
          {row.original.distance != null
            ? `${row.original.distance.toFixed(1)} km`
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
      id: "status",
      header: "",
      cell: ({ row }) =>
        !row.original.end_date ? (
          <Badge variant="secondary">{t("ongoing")}</Badge>
        ) : null,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{tCommon("actions")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <ButtonLink
            variant="ghost"
            size="icon-sm"
            href={`/drives/${row.original.id}`}
            aria-label={tCommon("edit")}
          >
            <Pencil className="size-3.5" aria-hidden />
          </ButtonLink>
        </div>
      ),
    },
  ];
}
