export function computeDurationMin(
  startDate: string,
  endDate: string,
): number | null {
  if (!startDate || !endDate) return null;
  const s = new Date(startDate).getTime();
  const e = new Date(endDate).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.round((e - s) / 60000);
}

/**
 * Formatage d'une durée en minutes vers un libellé i18n (`duration.minutes`,
 * `duration.hours`, `duration.days`). Partagé entre les listes drives et charges
 * (auparavant dupliqué dans chaque fichier de colonnes).
 */
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

/** Durée en HH:MM (comme le dashboard Grafana). `null` → "—". */
export function formatDurationHHMM(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
