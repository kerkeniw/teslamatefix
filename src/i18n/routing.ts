import { defineRouting } from "next-intl/routing";

/**
 * Configuration de routing next-intl.
 * - locales: liste fermée FR/EN
 * - defaultLocale: lue depuis env (DEFAULT_LOCALE) au runtime côté serveur,
 *   mais figée à 'fr' dans la config statique pour rester déterministe à la build.
 * - localePrefix: 'as-needed' → la locale par défaut n'apparaît pas dans l'URL
 *   (ex. `/drives` = `/fr/drives`), `/en/drives` reste accessible explicitement.
 */
export const routing = defineRouting({
  locales: ["fr", "en"] as const,
  defaultLocale: "fr",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
