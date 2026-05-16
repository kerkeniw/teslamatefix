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
