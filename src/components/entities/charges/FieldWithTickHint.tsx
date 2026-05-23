"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { DateTimeInput } from "@/components/form/datetime-input";

type CommonProps = {
  id: string;
  name: string;
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  tickValue: string | null;
  /** Tolérance numérique (kind=number) ou ms (kind=datetime). */
  tolerance?: number;
  formatTick?: (raw: string) => string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
};

type NumberKind = CommonProps & {
  kind: "number";
  step?: string;
  min?: number;
  max?: number;
};
type DateTimeKind = CommonProps & { kind: "datetime" };
type Props = NumberKind | DateTimeKind;

function eqNumber(a: string, b: string, tol: number): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) {
    return a.trim() === b.trim();
  }
  return Math.abs(na - nb) <= tol;
}

function eqDate(a: string, b: string, tolMs: number): boolean {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) {
    return a.trim() === b.trim();
  }
  return Math.abs(ta - tb) <= tolMs;
}

/**
 * Compose le label final en intégrant la valeur du tick. Si le label brut se
 * termine par "(unit)", on injecte " — tick : X" à l'intérieur de la
 * parenthèse, sinon on suffixe " (tick : X)". Toujours en un fragment React
 * pour permettre la coloration warn de la portion tick.
 */
function buildLabelWithTick(
  label: ReactNode,
  tickInner: string,
  differs: boolean,
): ReactNode {
  const tone = differs ? "text-warn" : "text-muted-foreground";
  if (typeof label === "string") {
    const match = /\(([^()]+)\)\s*$/.exec(label);
    if (match) {
      const before = label.slice(0, match.index);
      return (
        <>
          {before}({match[1]}
          <span className={tone}> — tick : {tickInner}</span>)
        </>
      );
    }
    return (
      <>
        {label} <span className={tone}>(tick : {tickInner})</span>
      </>
    );
  }
  return (
    <>
      {label} <span className={tone}>(tick : {tickInner})</span>
    </>
  );
}

/**
 * Champ formulaire augmenté d'une indication "valeur du tick correspondant"
 * intégrée au libellé (entre parenthèses si l'unité y figure déjà). Si la
 * valeur saisie diffère de celle du tick, la bordure passe en `warn` et la
 * portion "tick : X" du label reçoit le même tone.
 *
 * Sans tickValue, le composant se comporte comme un FormField + input normal.
 */
export function FieldWithTickHint(props: Props) {
  // Le hook est appelé inconditionnellement (règle des hooks) mais on
  // l'expose pour de futures traductions du suffixe ; aujourd'hui le format
  // "tick : X" est dur dans buildLabelWithTick.
  useTranslations("charges.hints");
  const { id, name, label, value, onChange, tickValue, error, required, disabled } = props;

  const hasTick = tickValue != null && tickValue !== "";
  const differs = hasTick
    ? props.kind === "datetime"
      ? !eqDate(value, tickValue!, props.tolerance ?? 1000)
      : !eqNumber(value, tickValue!, props.tolerance ?? 0)
    : false;

  const inputClassName = differs ? "border-warn focus-visible:ring-warn/40" : undefined;
  const display = hasTick ? (props.formatTick ? props.formatTick(tickValue!) : tickValue!) : "";
  const composedLabel = hasTick ? buildLabelWithTick(label, display, differs) : label;

  return (
    <FormField id={id} label={composedLabel} required={required} error={error ?? undefined}>
      {props.kind === "datetime" ? (
        <DateTimeInput
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
          required={required}
          disabled={disabled}
          className={inputClassName}
        />
      ) : (
        <NumberInput
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
          step={props.step ?? "any"}
          min={props.min}
          max={props.max}
          required={required}
          disabled={disabled}
          className={inputClassName}
        />
      )}
    </FormField>
  );
}
