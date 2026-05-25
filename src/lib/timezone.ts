import { cookies } from "next/headers";
import {
  DEFAULT_TIMEZONE,
  TZ_COOKIE,
  isValidTimeZone,
} from "@/lib/format/datetime";

/**
 * Lit l'identifiant IANA du fuseau horaire sélectionné par l'utilisateur
 * depuis le cookie httpOnly `tmfix_tz`. Retourne `DEFAULT_TIMEZONE` si le
 * cookie est absent ou contient une valeur invalide. Appelé en SSR par le
 * resolver `next-intl` et par les pages qui formatent côté serveur.
 */
export async function getSelectedTimezone(): Promise<string> {
  const store = await cookies();
  const raw = store.get(TZ_COOKIE.name)?.value;
  return isValidTimeZone(raw) ? raw : DEFAULT_TIMEZONE;
}

/**
 * Indique si le cookie de timezone est présent (peu importe sa validité) —
 * sert au `TimezoneDetector` pour décider s'il doit auto-renseigner la
 * valeur depuis `Intl.DateTimeFormat().resolvedOptions().timeZone`.
 */
export async function hasTimezoneCookie(): Promise<boolean> {
  const store = await cookies();
  return store.get(TZ_COOKIE.name)?.value != null;
}
