"use client";

import { useEffect } from "react";
import { setSelectedTimezoneAction } from "@/app/actions/select-timezone";
import { DEFAULT_TIMEZONE, isValidTimeZone } from "@/lib/format/datetime";

/**
 * Composant invisible monté dans le layout. Au premier chargement (cookie
 * `tmfix_tz` absent), détecte le fuseau du navigateur via
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` et persiste cette valeur
 * via la server action — la revalidation qui s'ensuit recharge la page avec
 * SSR rendu dans le bon fuseau.
 *
 * Si le navigateur retourne le même fuseau que le défaut SSR
 * (`Europe/Paris`), on ne déclenche pas la server action (évite une
 * revalidation inutile au premier load pour les utilisateurs français).
 */
export function TimezoneDetector({ hasCookie }: { hasCookie: boolean }) {
  useEffect(() => {
    if (hasCookie) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!isValidTimeZone(detected)) return;
    if (detected === DEFAULT_TIMEZONE) return;
    void setSelectedTimezoneAction(detected);
  }, [hasCookie]);

  return null;
}
