"use client";

import { forwardRef, useState, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTimezone } from "@/components/app-shell/timezone-provider";
import {
  formatLocalInputValue,
  parseLocalInputToUtc,
} from "@/lib/format/datetime";

/**
 * Input datetime-local fuseau-aware. La valeur acceptée en entrée (`value` ou
 * `defaultValue`) est un instant UTC (ISO complet ou `Date`). L'utilisateur
 * voit/édite l'heure dans le fuseau exposé par `TimezoneProvider`. Le
 * formulaire poste un `<input type="hidden" name>` qui contient l'ISO UTC
 * complet (`...Z`), prêt à être consommé par `new Date(...)` côté serveur.
 *
 * Pour les usages contrôlés, `onChange` est appelé avec un event dont
 * `target.value` contient l'ISO UTC (et non plus la string naïve). Les
 * consommateurs qui stockent simplement la string et la repassent en `value`
 * fonctionnent sans modification.
 */
type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue"
> & {
  value?: string | Date | null;
  defaultValue?: string | Date | null;
  /** Précision : seconde par défaut. */
  step?: number;
};

function toUtcIso(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export const DateTimeInput = forwardRef<HTMLInputElement, Props>(
  function DateTimeInput(
    { value, defaultValue, step = 1, className, name, onChange, ...rest },
    ref,
  ) {
    const tz = useTimezone();
    const isControlled = value !== undefined;

    // En mode uncontrolled, le composant garde son propre état UTC pour que
    // l'input visible reste synchronisé si le fuseau change après mount (la
    // re-render reconvertit avec la nouvelle TZ).
    const [internalUtcIso, setInternalUtcIso] = useState<string>(() =>
      toUtcIso(isControlled ? null : defaultValue),
    );

    const currentUtcIso = isControlled ? toUtcIso(value) : internalUtcIso;
    const visibleValue = formatLocalInputValue(currentUtcIso, tz);

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      const naive = e.target.value;
      const utcIso = naive
        ? (parseLocalInputToUtc(naive, tz)?.toISOString() ?? "")
        : "";

      if (!isControlled) {
        setInternalUtcIso(utcIso);
      }

      if (onChange) {
        // Event synthétique : on remplace `target` par un proxy léger qui
        // expose la valeur UTC. Les consommateurs lisent `e.target.value` ou
        // `e.target.name` — c'est tout ce qu'on doit fournir.
        const proxy = {
          value: utcIso,
          name: name ?? "",
        } as unknown as HTMLInputElement;
        onChange({
          ...e,
          target: proxy,
          currentTarget: proxy,
        } as ChangeEvent<HTMLInputElement>);
      }
    }

    return (
      <>
        {name ? (
          <input type="hidden" name={name} value={currentUtcIso} readOnly />
        ) : null}
        <Input
          ref={ref}
          type="datetime-local"
          step={step}
          value={visibleValue}
          onChange={handleChange}
          className={cn("font-mono tabular-nums", className)}
          {...rest}
        />
      </>
    );
  },
);
