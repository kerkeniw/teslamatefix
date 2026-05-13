"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import { OffsetPagination } from "@/components/data-table/pagination";
import { FirmwareLink } from "@/components/tesla/firmware-link";
import {
  useUpdateColumns,
  formatDuration,
  type UpdateRow,
} from "./UpdateDataTableColumns";

export function UpdateListClient({
  data,
  total,
  page,
  pageSize,
}: {
  data: UpdateRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const t = useTranslations("updates");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const columns = useUpdateColumns();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <ButtonLink href="/updates/new">
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
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <FirmwareLink version={row.version} />
                {!row.end_date ? (
                  <Badge variant="secondary">{t("ongoing")}</Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("fields.carId")}</span>
                <span>{row.car_label}</span>
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
                  href={`/updates/${row.id}`}
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
