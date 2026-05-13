"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

/**
 * Input numérique avec bornes (min/max), step optionnel et formatage lazy.
 * Pour les colonnes `numeric(p,s)` de Postgres : passer `min` / `max` / `step`
 * dérivés de la précision (ex. numeric(6,2) → step=0.01, max=9999.99).
 *
 * Important : on distingue `value === undefined` (prop pas passée → uncontrolled,
 * `defaultValue` actif) de `value === null` (prop passée explicitement → controlled
 * avec valeur vide). Mal géré, ça transforme le composant en input contrôlé-vide
 * et écrase silencieusement `defaultValue` (cf. docs/AUDIT_NAV.md bug #1).
 */
export type NumberInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue"
> & {
  value?: number | string | null;
  defaultValue?: number | string | null;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    { value, defaultValue, inputMode = "decimal", step = "any", ...rest },
    ref,
  ) {
    const inputProps: React.InputHTMLAttributes<HTMLInputElement> = { ...rest };
    if (value !== undefined) {
      inputProps.value = value === null ? "" : String(value);
    } else if (defaultValue !== undefined) {
      inputProps.defaultValue = defaultValue === null ? "" : String(defaultValue);
    }
    return (
      <Input
        ref={ref}
        type="number"
        inputMode={inputMode}
        step={step}
        {...inputProps}
      />
    );
  },
);
