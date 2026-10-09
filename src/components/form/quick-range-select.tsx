"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  QUICK_RANGE_GROUPS,
  isQuickRangeKey,
  type QuickRangeKey,
} from "@/lib/positions/quick-ranges";

/**
 * Menu des plages rapides façon Grafana (« Aujourd'hui », « 7 derniers jours »…),
 * partagé par les listes Positions, Trajets et Charges. Le preset actif vient de
 * l'URL (`qr`) ; « Personnalisé » s'affiche quand la plage a été saisie à la main.
 */
export function QuickRangeSelect({
  id,
  value,
  onPick,
}: {
  id?: string;
  value: QuickRangeKey | null;
  onPick: (key: QuickRangeKey) => void;
}) {
  const tPos = useTranslations("positions");
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => {
        if (isQuickRangeKey(typeof v === "string" ? v : "")) onPick(v as QuickRangeKey);
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={tPos("filters.customRange")} />
      </SelectTrigger>
      <SelectContent>
        {QUICK_RANGE_GROUPS.map((g) => (
          <SelectGroup key={g.labelKey}>
            <SelectLabel>{tPos(`filters.quickRangeGroups.${g.labelKey}`)}</SelectLabel>
            {g.keys.map((k) => (
              <SelectItem key={k} value={k}>
                {tPos(`filters.quickRanges.${k}`)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
