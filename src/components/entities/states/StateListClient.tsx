"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import { OffsetPagination } from "@/components/data-table/pagination";
import {
  useStateColumns,
  formatDuration,
  StateBadge,
  type StateRow,
} from "./StateDataTableColumns";

export function StateListClient({
  data,
  total,
  page,
  pageSize,
}: {
  data: StateRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const t = useTranslations("states");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const columns = useStateColumns();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <ButtonLink href="/states/new">
          <Plus className="size-4" aria-hidden />
          {t("new")}
        </ButtonLink>
      </div>

      <div className="hidden md:block">
        <DataTable columns={columns} data={data} emptyMessage={t("empty")} />
      </div>

      {/* Timeline mobile : chaque état affiche un indicateur coloré, vehicle, dates et durée. */}
      <div className="grid gap-3 md:hidden">
        {data.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}
        {data.map((row) => (
          <Card key={row.id} size="sm">
            <CardContent className="flex gap-3 pt-4">
              <div className="flex flex-col items-center pt-1">
                <span
                  aria-hidden
                  className={
                    row.state === "online"
                      ? "size-3 rounded-full bg-ok"
                      : row.state === "asleep"
                        ? "size-3 rounded-full bg-muted-foreground"
                        : "size-3 rounded-full bg-critical"
                  }
                />
                <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
              </div>
              <div className="flex-1 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <StateBadge state={row.state} />
                  {!row.end_date ? (
                    <Badge variant="secondary">{t("ongoing")}</Badge>
                  ) : null}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.startDate")}</span>
                  <span>{format.dateTime(new Date(row.start_date), "short")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.endDate")}</span>
                  <span>
                    {row.end_date ? format.dateTime(new Date(row.end_date), "short") : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.duration")}</span>
                  <span>{formatDuration(row.start_date, row.end_date, t)}</span>
                </div>
                <div className="pt-2">
                  <ButtonLink
                    size="sm"
                    variant="outline"
                    href={`/states/${row.id}`}
                    className="w-full"
                  >
                    {tCommon("edit")}
                  </ButtonLink>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <OffsetPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
