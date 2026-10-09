"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  ORIGIN_COLORS,
  POSITION_ORIGINS,
  type OriginCounts,
  type OriginMode,
  type PositionOrigin,
} from "@/lib/positions/origin";

/** Pastille colorée + libellé court d'une origine de position. */
export function OriginBadge({
  origin,
  d13Kind,
  className,
}: {
  origin: PositionOrigin;
  d13Kind?: string | null;
  className?: string;
}) {
  const t = useTranslations("positions.origin");
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", className)}
      title={t(`descriptions.${origin}`)}
    >
      <span
        aria-hidden
        className="inline-block size-2.5 shrink-0 rounded-full"
        style={{ background: ORIGIN_COLORS[origin] }}
      />
      {t(`short.${origin}`)}
      {d13Kind ? <span className="font-mono text-muted-foreground">{d13Kind}</span> : null}
    </span>
  );
}

/**
 * Répartition des positions d'un trajet par origine, avec l'avertissement
 * « données reconstruites » et la mention du mode dégradé sans TeslaMateAPI.
 */
export function OriginSummary({
  counts,
  mode,
  className,
}: {
  counts: OriginCounts;
  mode: OriginMode;
  className?: string;
}) {
  const t = useTranslations("positions.origin");
  const total = POSITION_ORIGINS.reduce((s, o) => s + counts[o], 0);
  if (total === 0) return null;
  const reconstructed = counts.d13 + counts.flux_complete;
  const shown = POSITION_ORIGINS.filter((o) => counts[o] > 0 || mode === "full");

  return (
    <div className={cn("space-y-2 rounded-md border bg-card p-3 text-sm", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t("title")}</span>
        {shown.map((o) => (
          <span key={o} className="inline-flex items-center gap-1.5">
            <OriginBadge origin={o} />
            <span className="font-mono text-xs tabular-nums">
              {counts[o]}
              <span className="text-muted-foreground">
                {" "}
                ({Math.round((counts[o] / total) * 100)} %)
              </span>
            </span>
          </span>
        ))}
      </div>
      {/* Barre de répartition */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {POSITION_ORIGINS.map((o) =>
          counts[o] > 0 ? (
            <span
              key={o}
              style={{ width: `${(counts[o] / total) * 100}%`, background: ORIGIN_COLORS[o] }}
            />
          ) : null,
        )}
      </div>
      {reconstructed > 0 ? (
        <p className="text-xs text-warn">{t("reconstructedWarning", { n: reconstructed })}</p>
      ) : null}
      {mode === "columns" ? (
        <p className="text-xs text-muted-foreground">{t("columnsOnly")}</p>
      ) : null}
    </div>
  );
}
