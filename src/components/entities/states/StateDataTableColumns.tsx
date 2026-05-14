"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations, useFormatter } from "next-intl";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";

export type StateStatus = "online" | "offline" | "asleep";

export type StateRow = {
  id: number;
  state: StateStatus;
  start_date: string;
  end_date: string | null;
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

export function StateBadge({ state }: { state: StateStatus }) {
  const t = useTranslations("states");
  // Couleurs sémantiques : online = primary (rouge Tesla), asleep = secondary
  // (gris), offline = destructive (rouge plus saturé). Comme le projet utilise
  // base-nova, on s'appuie sur les variants Badge existants + une teinte explicite.
  if (state === "online") {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-500">
        {t("values.online")}
      </Badge>
    );
  }
  if (state === "asleep") {
    return <Badge variant="secondary">{t("values.asleep")}</Badge>;
  }
  return <Badge variant="destructive">{t("values.offline")}</Badge>;
}

export function useStateColumns(): ColumnDef<StateRow>[] {
  const t = useTranslations("states");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  return [
    {
      accessorKey: "id",
      header: tCommon("id"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: "state",
      header: t("fields.state"),
      cell: ({ row }) => <StateBadge state={row.original.state} />,
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
          <ButtonLink
            variant="ghost"
            size="icon-sm"
            href={`/states/${row.original.id}`}
            aria-label={tCommon("edit")}
          >
            <Pencil className="size-3.5" aria-hidden />
          </ButtonLink>
        </div>
      ),
    },
  ];
}
