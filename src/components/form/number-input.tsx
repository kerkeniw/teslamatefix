"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

/**
 * Input numérique avec bornes (min/max), step optionnel et formatage lazy.
 * Pour les colonnes `numeric(p,s)` de Postgres : passer `min` / `max` / `step`
 * dérivés de la précision (ex. numeric(6,2) → step=0.01, max=9999.99).
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
    return (
      <Input
        ref={ref}
        type="number"
        inputMode={inputMode}
        step={step}
        value={value == null ? "" : String(value)}
        defaultValue={
          defaultValue == null ? undefined : String(defaultValue)
        }
        {...rest}
      />
    );
  },
);
