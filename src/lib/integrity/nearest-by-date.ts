/**
 * Sélection pure de la mesure la plus proche dans le temps d'une date de
 * référence, entre une mesure antérieure/égale et une mesure postérieure.
 *
 * Utilisé pour estimer la capacité batterie « à la période » d'un trajet
 * (cf. `estimateFullRange` dans `drives/actions.ts`) : on récupère la mesure la
 * plus proche avant `refMs` et la plus proche après, puis on garde celle dont
 * l'écart temporel est le plus faible. En cas d'égalité stricte, l'antérieure
 * est privilégiée (déterministe).
 */
export function pickNearestByDate<T extends { date: Date }>(
  before: T | null,
  after: T | null,
  refMs: number,
): T | null {
  if (before && after) {
    const diffBefore = Math.abs(before.date.getTime() - refMs);
    const diffAfter = Math.abs(after.date.getTime() - refMs);
    return diffAfter < diffBefore ? after : before;
  }
  return before ?? after ?? null;
}
