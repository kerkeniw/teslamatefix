"use client";

import { useMemo, useTransition } from "react";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { setSelectedTimezoneAction } from "@/app/actions/select-timezone";
import {
  formatOffsetLabel,
  getCurrentOffsetMinutes,
} from "@/lib/format/datetime";

type TzItem = {
  value: string;
  continent: string;
  city: string;
  offsetMinutes: number;
  label: string;
  shortLabel: string;
};

// Forme attendue par base-ui pour les items groupés (cf.
// `@base-ui/react/internals/resolveValueLabel.d.ts`). L'attribut `value`
// porte le libellé du groupe et reste libre — base-ui ne se base que sur
// la présence de `items` pour détecter le mode groupé.
type TzGroup = { value: string; items: TzItem[] };

function listTimezoneGroups(now: Date): TzGroup[] {
  const ids = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC", "Europe/Paris", "Europe/London", "America/New_York", "Asia/Tokyo"];
  const byContinent = new Map<string, TzItem[]>();
  for (const value of ids) {
    let offsetMinutes: number;
    try {
      offsetMinutes = getCurrentOffsetMinutes(value, now);
    } catch {
      continue;
    }
    const [continent, ...rest] = value.split("/");
    const city = (rest.join("/") || continent).replaceAll("_", " ");
    const offset = formatOffsetLabel(offsetMinutes);
    const item: TzItem = {
      value,
      continent,
      city,
      offsetMinutes,
      label: `${value} (${offset})`,
      shortLabel: `${city} (${offset})`,
    };
    const arr = byContinent.get(continent) ?? [];
    arr.push(item);
    byContinent.set(continent, arr);
  }
  const groups: TzGroup[] = [];
  for (const [continent, items] of byContinent) {
    items.sort((a, b) => a.city.localeCompare(b.city));
    groups.push({ value: continent, items });
  }
  groups.sort((a, b) => a.value.localeCompare(b.value));
  return groups;
}

/**
 * Combobox de sélection de fuseau horaire affichée dans le header. La liste
 * est construite à partir de `Intl.supportedValuesOf('timeZone')` (≈ 420
 * entrées) et passée à base-ui au format `Group<TzItem>[]` ; le rendu
 * délègue à `<ComboboxCollection>` (render-prop) pour itérer sur les items
 * filtrés par la saisie — sinon le filtre interne de base-ui n'a aucun
 * effet sur le DOM.
 *
 * Au changement, `setSelectedTimezoneAction` persiste le cookie `tmfix_tz`
 * et revalide la layout.
 */
export function TimezonePicker({ selected }: { selected: string }) {
  const t = useTranslations("timezone");
  const tCommon = useTranslations("combobox");
  const [pending, startTransition] = useTransition();

  // `now` capturé une fois au mount : la liste de ~420 offsets est stable
  // pendant la session ; recalculer à chaque render serait gaspillé.
  const groups = useMemo(() => listTimezoneGroups(new Date()), []);

  const selectedItem = useMemo<TzItem>(() => {
    for (const g of groups) {
      const m = g.items.find((it) => it.value === selected);
      if (m) return m;
    }
    return {
      value: selected,
      continent: selected.split("/")[0] ?? selected,
      city: selected,
      offsetMinutes: 0,
      label: selected,
      shortLabel: selected,
    };
  }, [groups, selected]);

  function onValueChange(next: TzItem | null) {
    if (!next || next.value === selected) return;
    startTransition(() => {
      void setSelectedTimezoneAction(next.value);
    });
  }

  return (
    <Combobox
      items={groups}
      value={selectedItem}
      onValueChange={onValueChange}
      itemToStringLabel={(item: TzItem) => item.label}
      itemToStringValue={(item: TzItem) => item.value}
      disabled={pending}
    >
      <ComboboxInput
        aria-label={t("label")}
        placeholder={t("placeholder")}
        disabled={pending}
        className="min-w-[12rem]"
      >
        <InputGroupAddon align="inline-start">
          <Globe className="size-3.5 text-muted-foreground" aria-hidden />
        </InputGroupAddon>
      </ComboboxInput>
      <ComboboxContent>
        <ComboboxEmpty>{tCommon("noResults")}</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(group: TzGroup) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(item: TzItem) => (
                    <ComboboxItem key={item.value} value={item}>
                      <span className="truncate">{item.shortLabel}</span>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
