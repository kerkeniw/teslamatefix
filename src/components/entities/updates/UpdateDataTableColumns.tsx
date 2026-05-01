"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations, useFormatter } from "next-intl";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FirmwareLink } from "@/components/tesla/firmware-link";
import { Link } from "@/i18n/navigation";

export type UpdateRow = {
  id: number;
  start_date: string;
  end_date: string | null;
  version: string | null;
  car_id: number;
  car_label: string;
};

export function formatDuration(
  startISO: string,
  endISO: string | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (!endISO) return "—";
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const diffMin = Math.round((end - start) / 60000);
  if (diffMin < 60) return t("duration.minutes", { m: diffMin });
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  if (hours < 24) return t("duration.hours", { h: hours, m: minutes });
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return t("duration.days", { d: days, h: remHours });
}

export function useUpdateColumns(): ColumnDef<UpdateRow>[] {
  const t = useTranslations("updates");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  return [
    {
      accessorKey: "id",
      header: tCommon("id"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: "car_id",
      header: t("fields.carId"),
      cell: ({ row }) => row.original.car_label,
    },
    {
      accessorKey: "start_date",
      header: t("fields.startDate"),
      cell: ({ row }) => format.dateTime(new Date(row.original.start_date), "short"),
    },
    {
      accessorKey: "end_date",
      header: t("fields.endDate"),
      cell: ({ row }) =>
        row.original.end_date ? (
          format.dateTime(new Date(row.original.end_date), "short")
        ) : (
          <Badge variant="secondary">{t("ongoing")}</Badge>
        ),
    },
    {
      accessorKey: "version",
      header: t("fields.version"),
      cell: ({ row }) => <FirmwareLink version={row.original.version} />,
    },
    {
      id: "duration",
      header: t("fields.duration"),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDuration(row.original.start_date, row.original.end_date, t)}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{tCommon("actions")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            render={
              <Link
                href={`/updates/${row.original.id}`}
                aria-label={tCommon("edit")}
              />
            }
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];
}
