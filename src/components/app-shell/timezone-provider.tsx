"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_TIMEZONE } from "@/lib/format/datetime";

/**
 * Expose le fuseau horaire actif aux composants client qui ne peuvent pas
 * utiliser `next-intl` (cas typique : `DateTimeInput` qui doit convertir
 * lui-même les composants H/m/s, ou un libellé manuel hors `format.dateTime`).
 *
 * La valeur SSR vient du cookie `tmfix_tz` lu dans le layout ; le provider
 * la diffuse ensuite via Context. Quand l'utilisateur change de fuseau via
 * le combobox, la server action revalide la layout → le provider reçoit la
 * nouvelle valeur et tous les consommateurs re-rendent.
 */
const TimezoneContext = createContext<string>(DEFAULT_TIMEZONE);

export function TimezoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: ReactNode;
}) {
  return (
    <TimezoneContext.Provider value={timeZone}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone(): string {
  return useContext(TimezoneContext);
}
