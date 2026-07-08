/**
 * Presets « quick range » façon Grafana pour la vue Positions.
 *
 * La carte se charge en AJAX incrémental sans plafond de plage : on propose donc
 * la liste Grafana complète (jusqu'à 5 ans), **hors plages fiscales** (omises).
 * Le tableau, lui, reste borné à 31 jours (garde-fou côté page).
 *
 * Fonctions pures (pas d'import serveur) : utilisables côté client comme serveur.
 * Les plages calendaires sont calculées dans le fuseau du `Date` fourni — côté
 * client, l'heure locale du navigateur.
 */

export type QuickRangeKey =
  // Relatives (from = now − N, to = now)
  | "1h"
  | "6h"
  | "12h"
  | "24h"
  | "2d"
  | "7d"
  | "30d"
  | "90d"
  | "6mo"
  | "1y"
  | "2y"
  | "5y"
  // Journée
  | "today"
  | "todaySoFar"
  | "yesterday"
  | "dayBeforeYesterday"
  | "thisDayLastWeek"
  // Période en cours
  | "thisWeek"
  | "thisWeekSoFar"
  | "thisMonth"
  | "thisMonthSoFar"
  | "thisYear"
  | "thisYearSoFar"
  // Périodes précédentes
  | "previousWeek"
  | "previousMonth"
  | "previousYear";

/** Preset par défaut à l'ouverture de la page. */
export const DEFAULT_QUICK_RANGE: QuickRangeKey = "7d";

/** Groupes affichés dans le menu déroulant. */
export const QUICK_RANGE_GROUPS: { labelKey: string; keys: QuickRangeKey[] }[] = [
  { labelKey: "relative", keys: ["1h", "6h", "12h", "24h", "2d", "7d", "30d", "90d", "6mo", "1y", "2y", "5y"] },
  { labelKey: "day", keys: ["today", "todaySoFar", "yesterday", "dayBeforeYesterday", "thisDayLastWeek"] },
  { labelKey: "current", keys: ["thisWeek", "thisWeekSoFar", "thisMonth", "thisMonthSoFar", "thisYear", "thisYearSoFar"] },
  { labelKey: "previous", keys: ["previousWeek", "previousMonth", "previousYear"] },
];

/** Toutes les clés, à plat (ordre des groupes). */
export const QUICK_RANGE_KEYS: QuickRangeKey[] = QUICK_RANGE_GROUPS.flatMap((g) => g.keys);

const HOUR = 3_600_000;
const DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function startOfWeek(d: Date): Date {
  // Semaine commençant le lundi (convention européenne).
  const c = startOfDay(d);
  const dow = c.getDay(); // 0 = dimanche … 6 = samedi
  const diff = (dow + 6) % 7; // lundi = 0
  c.setDate(c.getDate() - diff);
  return c;
}

function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const c = new Date(start);
  c.setDate(c.getDate() + 6);
  return endOfDay(c);
}

function startOfMonth(d: Date): Date {
  const c = startOfDay(d);
  c.setDate(1);
  return c;
}

function endOfMonth(d: Date): Date {
  const c = startOfMonth(d);
  c.setMonth(c.getMonth() + 1);
  c.setDate(0); // dernier jour du mois précédent = dernier jour du mois courant
  return endOfDay(c);
}

function startOfYear(d: Date): Date {
  const c = startOfDay(d);
  c.setMonth(0, 1);
  return c;
}

function endOfYear(d: Date): Date {
  const c = startOfYear(d);
  c.setFullYear(c.getFullYear() + 1);
  c.setMilliseconds(-1);
  return c;
}

function addMonths(d: Date, n: number): Date {
  const c = new Date(d);
  c.setMonth(c.getMonth() + n);
  return c;
}

function addYears(d: Date, n: number): Date {
  const c = new Date(d);
  c.setFullYear(c.getFullYear() + n);
  return c;
}

/**
 * Calcule la plage {from, to} d'un preset à un instant donné.
 * Retourne `null` si la clé est inconnue.
 */
export function computeQuickRange(
  key: QuickRangeKey,
  now: Date = new Date(),
): { from: Date; to: Date } | null {
  switch (key) {
    // Relatives
    case "1h":
      return { from: new Date(now.getTime() - HOUR), to: now };
    case "6h":
      return { from: new Date(now.getTime() - 6 * HOUR), to: now };
    case "12h":
      return { from: new Date(now.getTime() - 12 * HOUR), to: now };
    case "24h":
      return { from: new Date(now.getTime() - DAY), to: now };
    case "2d":
      return { from: new Date(now.getTime() - 2 * DAY), to: now };
    case "7d":
      return { from: new Date(now.getTime() - 7 * DAY), to: now };
    case "30d":
      return { from: new Date(now.getTime() - 30 * DAY), to: now };
    case "90d":
      return { from: new Date(now.getTime() - 90 * DAY), to: now };
    case "6mo":
      return { from: addMonths(now, -6), to: now };
    case "1y":
      return { from: addYears(now, -1), to: now };
    case "2y":
      return { from: addYears(now, -2), to: now };
    case "5y":
      return { from: addYears(now, -5), to: now };

    // Journée
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "todaySoFar":
      return { from: startOfDay(now), to: now };
    case "yesterday": {
      const y = new Date(now.getTime() - DAY);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "dayBeforeYesterday": {
      const d = new Date(now.getTime() - 2 * DAY);
      return { from: startOfDay(d), to: endOfDay(d) };
    }
    case "thisDayLastWeek": {
      const d = new Date(now.getTime() - 7 * DAY);
      return { from: startOfDay(d), to: endOfDay(d) };
    }

    // Période en cours
    case "thisWeek":
      return { from: startOfWeek(now), to: endOfWeek(now) };
    case "thisWeekSoFar":
      return { from: startOfWeek(now), to: now };
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "thisMonthSoFar":
      return { from: startOfMonth(now), to: now };
    case "thisYear":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "thisYearSoFar":
      return { from: startOfYear(now), to: now };

    // Périodes précédentes
    case "previousWeek": {
      const prev = new Date(startOfWeek(now).getTime() - DAY);
      return { from: startOfWeek(prev), to: endOfWeek(prev) };
    }
    case "previousMonth": {
      const prev = new Date(startOfMonth(now).getTime() - DAY);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "previousYear": {
      const prev = new Date(startOfYear(now).getTime() - DAY);
      return { from: startOfYear(prev), to: endOfYear(prev) };
    }

    default:
      return null;
  }
}

export function isQuickRangeKey(v: string | undefined | null): v is QuickRangeKey {
  return v != null && (QUICK_RANGE_KEYS as string[]).includes(v);
}
