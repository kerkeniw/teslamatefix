"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type VisibilityState,
} from "@tanstack/react-table";
import { SlidersHorizontal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// Permet aux colonnes de porter un libellé lisible pour le menu de visibilité.
declare module "@tanstack/react-table" {
  // TData/TValue requis pour matcher la signature d'origine de ColumnMeta.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
  }
}

/**
 * DataTable générique stateless : pagination, tri et filtres sont gérés côté
 * serveur (URL search params). Le composant ne gère que le rendu.
 *
 * Options facultatives (désactivées par défaut → aucune incidence sur les listes
 * existantes) :
 * - `enableColumnVisibility` : menu « Colonnes » (cases à cocher) + scroll
 *   horizontal, pour les tableaux à nombreuses colonnes.
 * - `initialColumnVisibility` : visibilité par défaut des colonnes.
 * - `visibilityStorageKey` : persiste le choix de l'utilisateur en localStorage.
 * - `columnsLabel` / `toolbar` : libellé du bouton et contenu additionnel.
 */
export type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage?: string;
  loading?: boolean;
  enableColumnVisibility?: boolean;
  initialColumnVisibility?: VisibilityState;
  visibilityStorageKey?: string;
  columnsLabel?: string;
  toolbar?: ReactNode;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  emptyMessage = "Aucun résultat.",
  loading = false,
  enableColumnVisibility = false,
  initialColumnVisibility,
  visibilityStorageKey,
  columnsLabel = "Colonnes",
  toolbar,
}: DataTableProps<TData, TValue>) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility ?? {},
  );

  // Applique le choix persisté après le montage (évite tout mismatch d'hydratation).
  useEffect(() => {
    if (!enableColumnVisibility || !visibilityStorageKey) return;
    try {
      const raw = window.localStorage.getItem(visibilityStorageKey);
      if (raw) setColumnVisibility((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {
      /* ignore */
    }
  }, [enableColumnVisibility, visibilityStorageKey]);

  useEffect(() => {
    if (!enableColumnVisibility || !visibilityStorageKey) return;
    try {
      window.localStorage.setItem(
        visibilityStorageKey,
        JSON.stringify(columnVisibility),
      );
    } catch {
      /* ignore */
    }
  }, [columnVisibility, enableColumnVisibility, visibilityStorageKey]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: enableColumnVisibility ? { columnVisibility } : undefined,
    onColumnVisibilityChange: enableColumnVisibility ? setColumnVisibility : undefined,
  });

  const hideableColumns = enableColumnVisibility
    ? table.getAllLeafColumns().filter((c) => c.getCanHide())
    : [];

  return (
    <div className="space-y-3">
      {enableColumnVisibility ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          <details className="group relative">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium shadow-sm [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal className="size-4" aria-hidden />
              {columnsLabel}
            </summary>
            <div className="absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
              {hideableColumns.map((column) => (
                <label
                  key={column.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={(e) => column.toggleVisibility(e.target.checked)}
                    className="size-3.5"
                  />
                  {column.columnDef.meta?.label ?? column.id}
                </label>
              ))}
            </div>
          </details>
        </div>
      ) : null}

      <div
        className={
          enableColumnVisibility
            ? "overflow-x-auto rounded-xl border bg-card shadow-sm"
            : "overflow-hidden rounded-xl border bg-card shadow-sm"
        }
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {table.getVisibleLeafColumns().map((_c, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length || 1}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
