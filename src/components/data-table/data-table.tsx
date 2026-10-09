"use client";

import {
  columnVisibilityFeature,
  flexRender,
  metaHelper,
  tableFeatures,
  useTable,
  type CellData,
  type ColumnDef,
  type ColumnVisibilityState,
  type OnChangeFn,
  type RowData,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Fonctionnalités TanStack Table v9 utilisées par toutes les listes : seule la
 * visibilité des colonnes (tri, filtres et pagination sont côté serveur). Les
 * colonnes portent un libellé lisible (`meta.label`) pour le menu « Colonnes »
 * rendu par le composant parent. Défini au niveau module : référence stable.
 */
export const dataTableFeatures = tableFeatures({
  columnVisibilityFeature,
  columnMeta: metaHelper<{ label?: string }>(),
});

export type DataTableFeatures = typeof dataTableFeatures;

/** `ColumnDef` des listes de l'application (v9 : features en 1er paramètre). */
export type AppColumnDef<TData extends RowData, TValue extends CellData = CellData> = ColumnDef<
  DataTableFeatures,
  TData,
  TValue
>;

export type VisibilityState = ColumnVisibilityState;

/**
 * DataTable générique stateless : pagination, tri et filtres sont gérés côté
 * serveur (URL search params). Le composant ne gère que le rendu.
 *
 * La visibilité des colonnes est **pilotée par le parent** (props contrôlées),
 * afin que le menu « Colonnes » puisse vivre ailleurs dans la page. `scrollX`
 * active le scroll horizontal pour les tableaux à nombreuses colonnes. Sans ces
 * props, le comportement est identique à l'origine (aucune incidence sur les
 * autres listes).
 */
export type DataTableProps<TData extends RowData> = {
  columns: AppColumnDef<TData>[];
  data: TData[];
  emptyMessage?: string;
  loading?: boolean;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  scrollX?: boolean;
  /** Padding de cellules réduit (tableaux à nombreuses colonnes). */
  dense?: boolean;
};

export function DataTable<TData extends RowData>({
  columns,
  data,
  emptyMessage = "Aucun résultat.",
  loading = false,
  columnVisibility,
  onColumnVisibilityChange,
  scrollX = false,
  dense = false,
}: DataTableProps<TData>) {
  // v9 : modèle de lignes « core » intégré, plus de `getCoreRowModel`.
  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    state: columnVisibility ? { columnVisibility } : undefined,
    onColumnVisibilityChange,
  });

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm",
        scrollX ? "overflow-x-auto" : "overflow-hidden",
        dense && "[&_td]:px-2 [&_td]:py-2 [&_th]:px-2",
      )}
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
  );
}
