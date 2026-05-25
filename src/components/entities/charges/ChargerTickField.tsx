"use client";

import { useTranslations } from "next-intl";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChargerFieldStats } from "@/lib/integrity/charges";

type Kind = "int" | "text" | "bool";

type Props = {
  id: string;
  name: string;
  label: React.ReactNode;
  kind: Kind;
  /** Valeur courante (contrôlée par le parent). Pour kind=bool, "true"/"false". */
  value: string;
  onChange: (v: string) => void;
  /** Case "Appliquer à tous les ticks" (contrôlée par le parent). */
  applyAll: boolean;
  onApplyAllChange: (v: boolean) => void;
  /** Valeur du dernier tick au chargement (poste comme hidden `<name>_initial`). */
  initialValue: string;
  /** Stats agrégées sur tous les ticks de la session. */
  stats: ChargerFieldStats;
  /** Suggestions pour kind="text" → rend un <datalist>. */
  suggestions?: string[];
  step?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  error?: string | null;
  /**
   * Désactive la case "Appliquer à tous les ticks" (cas où la session a
   * plus de 2 ticks intermédiaires fiables — seul le dernier tick doit
   * pouvoir être corrigé).
   */
  applyAllDisabled?: boolean;
  /** Tooltip affiché au survol de la case quand elle est désactivée. */
  applyAllTooltip?: string;
};

/**
 * Champ borne édité depuis l'écran charge. Composant 100% contrôlé : value /
 * applyAll viennent du parent, ce qui permet aux boutons "Appliquer les
 * valeurs par défaut" et "Annuler" de manipuler tous les champs en bloc.
 *
 * Pour kind="text", si `suggestions` est non vide on rend un `<datalist>`
 * HTML natif lié à l'input : autocomplete sans empêcher la saisie libre.
 *
 * Le formulaire poste 3 champs HTML par instance :
 * - `<name>`           : la nouvelle valeur saisie ;
 * - `<name>_initial`   : valeur du dernier tick (détection diff côté serveur) ;
 * - `<name>_apply_all` : "true" si la case est cochée, "false" sinon.
 */
export function ChargerTickField({
  id,
  name,
  label,
  kind,
  value,
  onChange,
  applyAll,
  onApplyAllChange,
  initialValue,
  stats,
  suggestions,
  step,
  min,
  max,
  disabled,
  error,
  applyAllDisabled = false,
  applyAllTooltip,
}: Props) {
  const t = useTranslations("charges.hints");
  const tCommon = useTranslations("common");

  const showStats = !stats.uniform && stats.distinct.length > 0;
  const statsLabel =
    stats.min != null && stats.max != null
      ? t("statsRange", { min: stats.min, max: stats.max })
      : t("statsDistinct", { values: stats.distinct.join(", ") });

  const datalistId = suggestions && suggestions.length > 0 ? `${id}-suggestions` : undefined;

  return (
    <FormField id={id} label={label} error={error ?? undefined}>
      <div className="space-y-1.5">
        {kind === "bool" ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value === "true"}
                onChange={(e) => onChange(e.target.checked ? "true" : "false")}
                className="size-4 rounded border-input"
                disabled={disabled}
              />
              {value === "true" ? tCommon("yes") : tCommon("no")}
            </label>
            <input type="hidden" name={name} value={value} />
          </>
        ) : kind === "int" ? (
          <NumberInput
            id={id}
            name={name}
            value={value}
            onChange={(e) => onChange((e.target as HTMLInputElement).value)}
            step={step ?? "1"}
            min={min}
            max={max}
            disabled={disabled}
          />
        ) : (
          <>
            <Input
              id={id}
              name={name}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              list={datalistId}
            />
            {datalistId ? (
              <datalist id={datalistId}>
                {suggestions!.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            ) : null}
          </>
        )}

        <input type="hidden" name={`${name}_initial`} value={initialValue} />
        <input
          type="hidden"
          name={`${name}_apply_all`}
          value={applyAll ? "true" : "false"}
        />

        <div className="flex flex-wrap items-center gap-2">
          {showStats ? (
            <Badge
              variant="outline"
              className={cn("font-mono text-[10px] text-muted-foreground")}
            >
              {statsLabel}
            </Badge>
          ) : null}
          <label
            className={cn(
              "ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground",
              applyAllDisabled && "opacity-50",
            )}
            title={applyAllDisabled ? applyAllTooltip : undefined}
          >
            <input
              type="checkbox"
              checked={applyAll}
              onChange={(e) => onApplyAllChange(e.target.checked)}
              className="size-3.5 rounded border-input"
              disabled={disabled || applyAllDisabled}
            />
            {t("applyToAllTicks")}
          </label>
        </div>
      </div>
    </FormField>
  );
}
