"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Props = {
  startSoc: number | null;
  endSoc: number | null;
  startRangeKm: number | null;
  endRangeKm: number | null;
};

function BatteryFillIcon({ pct }: { pct: number | null }) {
  const clamped = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const fillW = (14 * clamped) / 100;
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <rect
        x="2"
        y="7.5"
        width="16"
        height="9"
        rx="1.5"
        ry="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="19" y="10" width="2.5" height="4" rx="0.5" fill="currentColor" />
      {pct != null && clamped > 0 ? (
        <rect
          x="3"
          y="9"
          width={fillW}
          height="6"
          rx="0.5"
          className="fill-green-500"
        />
      ) : null}
    </svg>
  );
}

export function ChargeBatteryDeltaToggle({
  startSoc,
  endSoc,
  startRangeKm,
  endRangeKm,
}: Props) {
  const t = useTranslations("charges");
  const hasSoc = startSoc != null && endSoc != null;
  const hasKm = startRangeKm != null && endRangeKm != null;
  const [mode, setMode] = useState<"soc" | "km">(hasSoc ? "soc" : "km");

  if (!hasSoc && !hasKm) return null;

  const start =
    mode === "soc" ? `${startSoc} %` : `${startRangeKm!.toFixed(1)} km`;
  const end =
    mode === "soc" ? `${endSoc} %` : `${endRangeKm!.toFixed(1)} km`;
  const canToggle = hasSoc && hasKm;

  return (
    <div className="inline-flex items-center gap-2 font-mono text-base">
      <span className="tabular-nums">{start}</span>
      <span aria-hidden>→</span>
      <span className="tabular-nums">{end}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={!canToggle}
        aria-label={t("actions.toggleBatteryUnit")}
        onClick={() => setMode((m) => (m === "soc" ? "km" : "soc"))}
      >
        <BatteryFillIcon pct={endSoc} />
      </Button>
    </div>
  );
}
