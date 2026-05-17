"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations, useFormatter } from "next-intl";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { cn } from "@/lib/utils";
import { STATE_TONES, type StateStatus } from "./state-tones";

export type { StateStatus };

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
  const tone = STATE_TONES[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
        tone.bg,
        tone.text,
        tone.border,
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
      {t(`values.${state}`)}
    </span>
  );
}

export function useStateColumns(): ColumnDef<StateRow>[] {
  const t = useTranslations("states");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  return [
    {
      accessorKey: "id",
      header: tCommon("id"),
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">{row.original.id}</span>
      ),
    },
    {
      accessorKey: "state",
      header: t("fields.state"),
      cell: ({ row }) => <StateBadge state={row.original.state} />,
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
      accessorKey: "end_date",
      header: t("fields.endDate"),
      cell: ({ row }) =>
        row.original.end_date ? (
          <span className="font-mono text-xs tabular-nums">
            {format.dateTime(new Date(row.original.end_date), "short")}
          </span>
        ) : (
          <Badge variant="secondary">{t("ongoing")}</Badge>
        ),
    },
    {
      id: "duration",
      header: t("fields.duration"),
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
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
