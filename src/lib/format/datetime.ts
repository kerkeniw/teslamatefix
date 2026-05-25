/**
 * Helpers de conversion entre une `Date` UTC (canonique en BD) et la valeur
 * affichée/saisie dans le fuseau choisi par l'utilisateur.
 *
 * Convention TeslaMateFix : toutes les colonnes `DateTime @db.Timestamp(6)`
 * contiennent un instant en UTC. L'utilisateur édite/lit dans le fuseau
 * exposé par `TimezoneProvider` (cookie `tmfix_tz`). Ces helpers sont les
 * seuls endroits qui doivent manipuler des composants H/m/s pour un fuseau —
 * partout ailleurs on passe des `Date` ou des ISO complets.
 */

export const DEFAULT_TIMEZONE = "Europe/Paris";

export const TZ_COOKIE = {
  name: "tmfix_tz",
  maxAge: 60 * 60 * 24 * 365, // 1 an, parallèle à VEHICLE_COOKIE
} as const;

type PartKey = "year" | "month" | "day" | "hour" | "minute" | "second";
type Parts = Record<PartKey, number>;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * Valide un identifiant IANA via `Intl.DateTimeFormat`. Utilisé à la lecture
 * du cookie et à la validation Zod de la server action.
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Coerce d'entrée flexible : null/undefined → null, string → Date, sinon
 * Date. Retourne null si le résultat n'est pas une date valide.
 */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Décompose un instant UTC en composants y/M/d/H/m/s tels qu'ils sont perçus
 * dans la timezone donnée. Utilise `formatToParts` (ICU) — gère DST + alias.
 */
function getPartsInTimeZone(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Partial<Parts> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type === "year" || p.type === "month" || p.type === "day" ||
        p.type === "hour" || p.type === "minute" || p.type === "second") {
      // `hour: "2-digit"` avec hour12:false peut renvoyer "24" pour minuit
      // sur certains runtimes — normaliser à 0.
      const n = Number.parseInt(p.value, 10);
      parts[p.type] = p.type === "hour" && n === 24 ? 0 : n;
    }
  }
  return parts as Parts;
}

/**
 * Convertit une `Date` UTC en string `YYYY-MM-DDTHH:mm:ss` exprimée dans le
 * fuseau `timeZone`. Format directement compatible avec
 * `<input type="datetime-local">`.
 */
export function formatLocalInputValue(
  value: Date | string | null | undefined,
  timeZone: string,
): string {
  const d = toDate(value);
  if (!d) return "";
  const p = getPartsInTimeZone(d, timeZone);
  return (
    `${pad4(p.year)}-${pad2(p.month)}-${pad2(p.day)}` +
    `T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`
  );
}

/**
 * Parse une string `YYYY-MM-DDTHH:mm[:ss]` interprétée comme heure locale du
 * fuseau `timeZone`, et retourne l'instant UTC correspondant.
 *
 * Algorithme : on suppose d'abord que les composants sont des composants UTC,
 * puis on demande à `Intl` quelle heure ils représenteraient effectivement
 * dans `timeZone` ; l'écart entre les deux donne l'offset à appliquer. On
 * recommence une fois si le résultat tombe juste après une transition DST
 * (l'offset a changé entre temps).
 */
export function parseLocalInputToUtc(
  naive: string,
  timeZone: string,
): Date | null {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(naive);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const target: Parts = {
    year: Number.parseInt(y, 10),
    month: Number.parseInt(mo, 10),
    day: Number.parseInt(d, 10),
    hour: Number.parseInt(h, 10),
    minute: Number.parseInt(mi, 10),
    second: s ? Number.parseInt(s, 10) : 0,
  };

  // Première estimation : on traite les composants comme s'ils étaient déjà
  // en UTC.
  let utcMs = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );

  // Deux itérations suffisent (en pratique 1 suffit hors transition DST,
  // 2 couvrent le saut horaire).
  for (let i = 0; i < 2; i++) {
    const parts = getPartsInTimeZone(new Date(utcMs), timeZone);
    const diffMs =
      Date.UTC(
        target.year,
        target.month - 1,
        target.day,
        target.hour,
        target.minute,
        target.second,
      ) -
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      );
    if (diffMs === 0) break;
    utcMs += diffMs;
  }

  return new Date(utcMs);
}

/**
 * Offset signé en minutes du fuseau à l'instant donné (par défaut : maintenant).
 * Ex : `Europe/Paris` en été retourne `120`, en hiver `60`.
 */
export function getCurrentOffsetMinutes(
  timeZone: string,
  at: Date = new Date(),
): number {
  const parts = getPartsInTimeZone(at, timeZone);
  const localAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((localAsUtcMs - at.getTime()) / 60000);
}

/**
 * Formate un offset en minutes vers `UTC±HH:MM` (ex : `120 → "UTC+02:00"`).
 */
export function formatOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/**
 * Formatage `dd/MM/yyyy HH:mm` (équivalent au preset `short` de next-intl)
 * pour les contextes où l'on n'a pas accès à `format.dateTime` (server
 * helpers, libellés de listes).
 */
export function formatDateTimeShort(
  date: Date | string,
  timeZone: string,
  locale: string,
): string {
  const d = toDate(date);
  if (!d) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Format ISO compact `YYYY-MM-DD HH:mm` dans le fuseau donné. Remplace les
 * `.toISOString().slice(0, 16).replace("T", " ")` éparpillés (qui restaient
 * en UTC).
 */
export function formatDateTimeIsoShort(
  date: Date | string,
  timeZone: string,
): string {
  const d = toDate(date);
  if (!d) return "";
  const p = getPartsInTimeZone(d, timeZone);
  return (
    `${pad4(p.year)}-${pad2(p.month)}-${pad2(p.day)} ` +
    `${pad2(p.hour)}:${pad2(p.minute)}`
  );
}
