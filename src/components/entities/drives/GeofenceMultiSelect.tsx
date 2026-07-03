"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { searchGeofencesAction } from "@/app/actions/search-geofences";
import type { FKOption } from "@/components/form/fk-combobox";

/**
 * Multi-sélection de géofences pour le filtre du listing des trajets.
 * Réutilise `searchGeofencesAction` (typeahead débouncé) ; rend des puces
 * retirables. La valeur remontée est une liste d'ids (sérialisée en CSV dans
 * l'URL par le parent). Aucun multi-select générique n'existe dans le repo.
 */
export function GeofenceMultiSelect({
  value,
  initial = [],
  onChange,
  placeholder,
}: {
  value: number[];
  initial?: FKOption[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
}) {
  const t = useTranslations("combobox");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FKOption[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Libellés des ids pré-sélectionnés (props) + cache des résultats de recherche.
  const initialMap = useMemo(
    () => new Map(initial.map((o) => [o.id, o.label])),
    [initial],
  );
  const [fetched, setFetched] = useState<Map<number, string>>(new Map());
  const labelOf = (id: number) => fetched.get(id) ?? initialMap.get(id) ?? `#${id}`;

  function fetchResults(q: string) {
    startTransition(async () => {
      const res = await searchGeofencesAction(q);
      setFetched((prev) => {
        const next = new Map(prev);
        for (const r of res) next.set(r.id, r.label);
        return next;
      });
      setResults(res);
    });
  }

  function onInput(text: string) {
    setQuery(text);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(text), 200);
  }

  function add(id: number) {
    if (!value.includes(id)) onChange([...value, id]);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function remove(id: number) {
    onChange(value.filter((v) => v !== id));
  }

  const available = results.filter((r) => !value.includes(r.id));

  return (
    <div className="relative">
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm">
        {value.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
          >
            {labelOf(id)}
            <button
              type="button"
              onClick={() => remove(id)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="remove"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => {
            setOpen(true);
            if (results.length === 0) fetchResults("");
          }}
          onBlur={() => {
            closeRef.current = setTimeout(() => setOpen(false), 150);
          }}
          placeholder={value.length === 0 ? (placeholder ?? t("placeholder")) : ""}
          className="min-w-[6rem] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open ? (
        <div
          className="absolute left-0 z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          onMouseDown={(e) => {
            // Empêche le blur de l'input de fermer le panneau avant le clic.
            e.preventDefault();
            if (closeRef.current) clearTimeout(closeRef.current);
          }}
        >
          {pending ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("loading")}</p>
          ) : available.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            available.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => add(r.id)}
                className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {r.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
