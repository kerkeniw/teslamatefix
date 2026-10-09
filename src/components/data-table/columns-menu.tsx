"use client";

import type { Dispatch, SetStateAction } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { AppColumnDef, VisibilityState } from "./data-table";

/**
 * Menu « Colonnes » des listes (trajets, charges) : une case par colonne
 * masquable (`meta.label`). La visibilité est pilotée par le parent, qui la
 * mémorise dans le navigateur.
 */
export function ColumnsMenu<TData extends Record<string, unknown>>({
  label,
  columns,
  visibility,
  onChange,
}: {
  label: string;
  columns: AppColumnDef<TData>[];
  visibility: VisibilityState;
  onChange: Dispatch<SetStateAction<VisibilityState>>;
}) {
  const hideable = columns.filter((c) => c.id && c.enableHiding !== false && c.meta?.label);
  return (
    <details className="relative hidden md:block">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium shadow-sm [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="size-4" aria-hidden />
        {label}
      </summary>
      <div className="absolute right-0 z-20 mt-1 max-h-96 w-64 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
        {hideable.map((c) => {
          const id = c.id as string;
          return (
            <label
              key={id}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={visibility[id] ?? true}
                onChange={(e) => onChange((prev) => ({ ...prev, [id]: e.target.checked }))}
                className="size-3.5"
              />
              {c.meta?.label}
            </label>
          );
        })}
      </div>
    </details>
  );
}
