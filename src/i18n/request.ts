import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { getSelectedTimezone } from "@/lib/timezone";

/**
 * Resolver de configuration par requête (rendu serveur).
 * Charge dynamiquement le fichier de messages JSON correspondant à la locale.
 *
 * `formats.dateTime.short` est explicitement déclaré : next-intl n'a PAS de
 * presets built-in pour `format.dateTime(d, "short")`, et sans cette
 * déclaration tous les appels remontent `MISSING_FORMAT`. La forme retenue
 * (`dd/MM/yyyy HH:mm` en `fr-FR`) est commune à toutes les listes d'entités et
 * au dashboard, pour rester court et homogène sur mobile.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const timeZone = await getSelectedTimezone();

  return {
    locale,
    timeZone,
    messages: (await import(`../messages/${locale}.json`)).default,
    formats: {
      dateTime: {
        short: {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        },
        date: {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        },
        time: {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        },
      },
    },
  };
});
