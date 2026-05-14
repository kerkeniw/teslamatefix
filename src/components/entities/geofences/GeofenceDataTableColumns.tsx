"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";

export type GeofenceRow = {
  id: number;
  name: string;
  latitude: string;
  longitude: string;
  radius: number;
  billing_type: "per_kwh" | "per_minute";
  cost_per_unit: string | null;
  session_fee: string | null;
};

export function useGeofenceColumns(): ColumnDef<GeofenceRow>[] {
  const t = useTranslations("geofences");
  const tCommon = useTranslations("common");
  return [
    {
      accessorKey: "id",
      header: tCommon("id"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: "name",
      header: t("fields.name"),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: "coords",
      header: `${t("fields.latitude")} / ${t("fields.longitude")}`,
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {Number(row.original.latitude).toFixed(4)}, {Number(row.original.longitude).toFixed(4)}
        </span>
      ),
    },
    {
      accessorKey: "radius",
      header: t("fields.radius"),
      cell: ({ row }) => `${row.original.radius} m`,
    },
    {
      accessorKey: "billing_type",
      header: t("fields.billingType"),
      cell: ({ row }) => (
        <Badge variant="outline">{t(`billingType.${row.original.billing_type}`)}</Badge>
      ),
    },
    {
      accessorKey: "cost_per_unit",
      header: t("fields.costPerUnit"),
      cell: ({ row }) =>
        row.original.cost_per_unit
          ? Number(row.original.cost_per_unit).toFixed(4)
          : "—",
    },
    {
      accessorKey: "session_fee",
      header: t("fields.sessionFee"),
      cell: ({ row }) =>
        row.original.session_fee ? Number(row.original.session_fee).toFixed(2) : "—",
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{tCommon("actions")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <ButtonLink
            variant="ghost"
            size="icon-sm"
            href={`/geofences/${row.original.id}`}
            aria-label={tCommon("edit")}
          >
            <Pencil className="size-3.5" aria-hidden />
          </ButtonLink>
        </div>
      ),
    },
  ];
}
