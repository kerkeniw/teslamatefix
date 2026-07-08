"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Button } from "@/components/ui/button";
import { driveColor } from "@/lib/positions/map-points";

export type DriveListItem = {
  id: number;
  start_date: string;
  end_date: string | null;
  distance: number | null;
};

export function DriveFilterList({
  drives,
  hiddenDrives,
  showLoose,
  hasLoose,
  onToggleDrive,
  onToggleLoose,
  onSelectAll,
  onSelectNone,
}: {
  drives: DriveListItem[];
  hiddenDrives: Set<number>;
  showLoose: boolean;
  hasLoose: boolean;
  onToggleDrive: (id: number) => void;
  onToggleLoose: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  const t = useTranslations("positions");
  const format = useFormatter();

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("map.drivesTitle")}</h3>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onSelectAll}>
            {t("map.selectAll")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onSelectNone}>
            {t("map.selectNone")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 max-h-[70vh] flex-1 space-y-1 overflow-y-auto pr-1">
        {drives.map((d) => (
          <label
            key={d.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted"
          >
            <input
              type="checkbox"
              checked={!hiddenDrives.has(d.id)}
              onChange={() => onToggleDrive(d.id)}
              className="size-3.5 cursor-pointer accent-tesla-red"
            />
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: driveColor(d.id) }}
              aria-hidden
            />
            <span className="font-mono">#{d.id}</span>
            <span className="truncate text-muted-foreground">
              {format.dateTime(new Date(d.start_date), "short")}
              {d.distance != null ? ` · ${format.number(d.distance, { maximumFractionDigits: 1 })} km` : ""}
            </span>
          </label>
        ))}

        {drives.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">{t("map.noDrives")}</p>
        ) : null}
      </div>

      {hasLoose ? (
        <label className="flex cursor-pointer items-center gap-2 border-t pt-2 text-xs hover:bg-muted">
          <input
            type="checkbox"
            checked={showLoose}
            onChange={onToggleLoose}
            className="size-3.5 cursor-pointer accent-tesla-red"
          />
          <span
            className="inline-block size-2.5 shrink-0 rounded-full bg-[#9ca3af]"
            aria-hidden
          />
          <span className="text-muted-foreground">{t("map.looseLabel")}</span>
        </label>
      ) : null}
    </div>
  );
}
