"use client";

import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import { OffsetPagination } from "@/components/data-table/pagination";
import { useGeofenceColumns, type GeofenceRow } from "./GeofenceDataTableColumns";

export function GeofenceListClient({
  data,
  total,
  page,
  pageSize,
}: {
  data: GeofenceRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const t = useTranslations("geofences");
  const tCommon = useTranslations("common");
  const columns = useGeofenceColumns();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <ButtonLink href="/geofences/new">
          <Plus className="size-4" aria-hidden />
          {t("new")}
        </ButtonLink>
      </div>

      <div className="hidden md:block">
        <DataTable columns={columns} data={data} emptyMessage={t("empty")} />
      </div>

      <div className="grid gap-3 md:hidden">
        {data.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}
        {data.map((row) => (
          <Card key={row.id} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{row.name}</span>
                <Badge variant="outline">{t(`billingType.${row.billing_type}`)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">lat,lon</span>
                <span>
                  {Number(row.latitude).toFixed(4)}, {Number(row.longitude).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("fields.radius")}</span>
                <span>{row.radius} m</span>
              </div>
              {row.cost_per_unit ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.costPerUnit")}</span>
                  <span>{Number(row.cost_per_unit).toFixed(4)}</span>
                </div>
              ) : null}
              {row.session_fee ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.sessionFee")}</span>
                  <span>{Number(row.session_fee).toFixed(2)}</span>
                </div>
              ) : null}
              <div className="pt-2">
                <ButtonLink
                  size="sm"
                  variant="outline"
                  href={`/geofences/${row.id}`}
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
