"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form/form-field";
import { DateTimeInput } from "@/components/form/datetime-input";

/**
 * Filtres pour la vue Positions. Le `car_id` n'est plus ici : il est imposé
 * par le sélecteur de véhicule du header. Restent : plage de date (≤ 31j en
 * combinaison) ou drive_id pour cibler les positions d'un trajet précis.
 */
export function PositionFilters({
  filters,
}: {
  filters: { from: string; to: string; drive_id: string };
}) {
  const t = useTranslations("positions");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [driveId, setDriveId] = useState(filters.drive_id);

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("from", from);
    else params.delete("from");
    if (to) params.set("to", to);
    else params.delete("to");
    if (driveId) params.set("drive_id", driveId);
    else params.delete("drive_id");
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
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-3">
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
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={applyFilters}>{t("filters.apply")}</Button>
        <Button variant="outline" onClick={resetFilters}>
          {t("filters.reset")}
        </Button>
      </div>
    </div>
  );
}
