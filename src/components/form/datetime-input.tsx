"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

/**
 * Input datetime-local avec sérialisation ISO. La valeur attendue/restituée
 * est une chaîne ISO ou Date ; le widget utilise le format `YYYY-MM-DDTHH:mm:ss`
 * que l'élément datetime-local accepte nativement.
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

function toLocalIsoSlice(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export const DateTimeInput = forwardRef<HTMLInputElement, Props>(
  function DateTimeInput({ value, defaultValue, step = 1, ...rest }, ref) {
    return (
      <Input
        ref={ref}
        type="datetime-local"
        step={step}
        value={value !== undefined ? toLocalIsoSlice(value) : undefined}
        defaultValue={
          defaultValue !== undefined ? toLocalIsoSlice(defaultValue) : undefined
        }
        {...rest}
      />
    );
  },
);
