"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/form/form-field";
import { DateTimeInput } from "@/components/form/datetime-input";
import { DataTable } from "@/components/data-table/data-table";
import { OffsetPagination } from "@/components/data-table/pagination";
import {
  useDriveColumns,
  formatDuration,
  type DriveRow,
} from "./DriveDataTableColumns";

export function DriveListClient({
  data,
  total,
  page,
  pageSize,
  filters,
}: {
  data: DriveRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    from: string;
    to: string;
    open_only: boolean;
  };
}) {
  const t = useTranslations("drives");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const columns = useDriveColumns();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [openOnly, setOpenOnly] = useState(filters.open_only);

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("from", from);
    else params.delete("from");
    if (to) params.set("to", to);
    else params.delete("to");
    if (openOnly) params.set("open_only", "1");
    else params.delete("open_only");
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  function resetFilters() {
    setFrom("");
    setTo("");
    setOpenOnly(false);
    router.push("?");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card p-4">
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
          <FormField id="filter_open" label={t("filters.openOnly")}>
            <label className="flex h-9 cursor-pointer items-center gap-2 px-2">
              <input
                type="checkbox"
                checked={openOnly}
                onChange={(e) => setOpenOnly(e.target.checked)}
                className="size-4 cursor-pointer accent-tesla-red"
              />
              <span className="text-sm">{t("filters.openOnly")}</span>
            </label>
          </FormField>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={applyFilters}>{t("filters.apply")}</Button>
          <Button variant="outline" onClick={resetFilters}>
            {t("filters.reset")}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <ButtonLink href="/drives/new">
          <Plus className="size-4" aria-hidden />
          {t("new")}
        </ButtonLink>
      </div>

      <div className="hidden md:block">
        <DataTable columns={columns} data={data} emptyMessage={t("empty")} />
      </div>

      <div className="grid gap-3 md:hidden">
        {data.length === 0 ? (
          <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}
        {data.map((row) => (
          <Card key={row.id} size="sm">
            <CardContent className="space-y-1.5 pt-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-muted-foreground">#{row.id}</span>
                {!row.end_date ? (
                  <Badge variant="secondary">{t("ongoing")}</Badge>
                ) : null}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("fields.startDate")}</span>
                <span>{format.dateTime(new Date(row.start_date), "short")}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("fields.origin")} → </span>
                <span>
                  {row.origin ?? "—"} → {row.destination ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("fields.distance")}</span>
                <span>
                  {row.distance != null ? `${row.distance.toFixed(1)} km` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("fields.durationMin")}</span>
                <span>{formatDuration(row.duration_min, t)}</span>
              </div>
              <div className="pt-2">
                <ButtonLink
                  size="sm"
                  variant="outline"
                  href={`/drives/${row.id}`}
                  className="w-full"
                >
                  {tCommon("edit")}
                </ButtonLink>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <OffsetPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
