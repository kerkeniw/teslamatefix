"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/form/form-field";
import { DateTimeInput } from "@/components/form/datetime-input";
import {
  QUICK_RANGE_GROUPS,
  computeQuickRange,
  isQuickRangeKey,
  type QuickRangeKey,
} from "@/lib/positions/quick-ranges";

/**
 * Filtres de la vue Positions (colonne de gauche). Le `car_id` est imposé par
 * le sélecteur de véhicule du header. Restent : plages rapides (menu déroulant
 * façon Grafana), plage de date manuelle ou drive_id pour cibler un trajet.
 *
 * Le preset actif est mémorisé dans l'URL (`qr`) — robuste vs. comparer des
 * timestamps qui dérivent. Une édition manuelle de la plage efface `qr`
 * (le dropdown affiche alors « Personnalisé »).
 */
export function PositionFilters({
  filters,
  activeRange,
}: {
  filters: { from: string; to: string; drive_id: string };
  activeRange: QuickRangeKey | null;
}) {
  const t = useTranslations("positions");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [driveId, setDriveId] = useState(filters.drive_id);

  function pushQuickRange(key: QuickRangeKey) {
    const range = computeQuickRange(key);
    if (!range) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", range.from.toISOString());
    params.set("to", range.to.toISOString());
    params.set("qr", key);
    params.delete("drive_id");
    params.delete("cursor");
    params.delete("direction");
    router.push(`?${params.toString()}`);
  }

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("from", from);
    else params.delete("from");
    if (to) params.set("to", to);
    else params.delete("to");
    if (driveId) params.set("drive_id", driveId);
    else params.delete("drive_id");
    params.delete("qr"); // plage manuelle : plus de preset actif
    params.delete("cursor");
    params.delete("direction");
    router.push(`?${params.toString()}`);
  }

  function resetFilters() {
    setFrom("");
    setTo("");
    setDriveId("");
    router.push("?");
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{t("filters.quickRangesTitle")}</h2>
        <Select
          value={activeRange ?? ""}
          onValueChange={(v) => {
            if (isQuickRangeKey(typeof v === "string" ? v : "")) pushQuickRange(v as QuickRangeKey);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("filters.customRange")} />
          </SelectTrigger>
          <SelectContent>
            {QUICK_RANGE_GROUPS.map((g) => (
              <SelectGroup key={g.labelKey}>
                <SelectLabel>{t(`filters.quickRangeGroups.${g.labelKey}`)}</SelectLabel>
                {g.keys.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`filters.quickRanges.${k}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 border-t pt-4">
        <FormField id="filter_from" label={t("filters.from")}>
          <DateTimeInput
            id="filter_from"
            value={from}
            onChange={(e) => setFrom((e.target as HTMLInputElement).value)}
          />
        </FormField>
        <FormField id="filter_to" label={t("filters.to")}>
          <DateTimeInput
            id="filter_to"
            value={to}
            onChange={(e) => setTo((e.target as HTMLInputElement).value)}
          />
        </FormField>
        <FormField id="filter_drive_id" label={t("filters.driveId")}>
          <Input
            id="filter_drive_id"
            type="number"
            min={1}
            value={driveId}
            onChange={(e) => setDriveId(e.target.value)}
          />
        </FormField>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={applyFilters}>{t("filters.apply")}</Button>
        <Button variant="outline" onClick={resetFilters}>
          {t("filters.reset")}
        </Button>
      </div>
    </div>
  );
}
