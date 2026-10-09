import type { ReactNode } from "react";

/**
 * Bandeau « Synthèse de la période » (comme la ligne de stats des dashboards
 * Grafana Drives / Charges) : une rangée compacte de chiffres clés calculés sur
 * l'ensemble filtré, pas seulement la page affichée.
 */
export function SummaryBar({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-xl border bg-card px-4 py-2 text-sm shadow-sm"
    >
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <dl className="contents">
        {items.map((it) => (
          <div key={it.label} className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-foreground">{it.label}</dt>
            <dd className="font-mono font-medium tabular-nums">{it.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
