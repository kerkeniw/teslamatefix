"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export type AddressRow = {
  id: number;
  display_name: string | null;
  road: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
};

export function useAddressColumns(): ColumnDef<AddressRow>[] {
  const t = useTranslations("addresses");
  const tCommon = useTranslations("common");
  return [
    {
      accessorKey: "id",
      header: tCommon("id"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: "display_name",
      header: t("fields.displayName"),
      cell: ({ row }) => (
        <span className="block max-w-[42ch] truncate" title={row.original.display_name ?? ""}>
          {row.original.display_name ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "city",
      header: t("fields.city"),
      cell: ({ row }) => row.original.city ?? "—",
    },
    {
      accessorKey: "country",
      header: t("fields.country"),
      cell: ({ row }) => row.original.country ?? "—",
    },
    {
      id: "coords",
      header: `${t("fields.latitude")} / ${t("fields.longitude")}`,
      cell: ({ row }) => {
        const lat = row.original.latitude;
        const lon = row.original.longitude;
        if (!lat || !lon) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="font-mono text-xs">
            {Number(lat).toFixed(4)}, {Number(lon).toFixed(4)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{tCommon("actions")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            render={
              <Link
                href={`/addresses/${row.original.id}`}
                aria-label={tCommon("edit")}
              />
            }
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];
}
