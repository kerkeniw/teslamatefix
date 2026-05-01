"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/form/form-field";
import { DateTimeInput } from "@/components/form/datetime-input";

export function PositionFilters({
  cars,
  filters,
}: {
  cars: { id: number; label: string }[];
  filters: { car_id: string; from: string; to: string; drive_id: string };
}) {
  const t = useTranslations("positions");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [carId, setCarId] = useState(filters.car_id);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [driveId, setDriveId] = useState(filters.drive_id);

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    if (carId) params.set("car_id", carId);
    else params.delete("car_id");
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
    setCarId("");
    setFrom("");
    setTo("");
    setDriveId("");
    router.push("?");
  }

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <FormField id="filter_car_id" label={t("filters.carId")}>
          <Select value={carId} onValueChange={(v) => setCarId(typeof v === "string" ? v : "")}>
            <SelectTrigger id="filter_car_id" className="w-full">
              <SelectValue placeholder={t("filters.all")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("filters.all")}</SelectItem>
              {cars.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
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
