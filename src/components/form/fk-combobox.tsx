"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export type FKOption = { id: number; label: string };
type FKItem = { value: string; label: string };

export type FKSearchAction = (query: string) => Promise<FKOption[]>;

/**
 * Combobox FK avec recherche typeahead côté serveur.
 *
 * - `name` est posté via un `<input type="hidden">` synchronisé avec l'item
 *   sélectionné — compatible avec un `<form action={…}>` natif.
 * - `initial` préremplit le combobox avec la valeur courante (sert aussi de
 *   sécurité si la valeur référencée n'est pas dans le top des résultats au
 *   premier chargement).
 * - `searchAction` est appelée à chaque saisie après un debounce de 200 ms.
 * - `allowClear` ajoute un bouton ✕ pour reset (FK nullable).
 */
export function FKCombobox({
  name,
  initial,
  searchAction,
  placeholder,
  emptyLabel,
  allowClear = false,
  disabled = false,
  id,
  required = false,
  form,
}: {
  name: string;
  initial: FKOption | null;
  searchAction: FKSearchAction;
  placeholder?: string;
  emptyLabel?: string;
  allowClear?: boolean;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  /** Rattache l'input hidden à un `<form id="...">` distant (HTML5 form attr). */
  form?: string;
}) {
  const t = useTranslations("combobox");
  const [selected, setSelected] = useState<FKOption | null>(initial);
  const [items, setItems] = useState<FKOption[]>(initial ? [initial] : []);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Le map id->label garde les anciens libellés en mémoire pour ne pas perdre
  // l'affichage lors d'une frappe (les items courants peuvent ne plus contenir
  // l'option sélectionnée).
  const labelCache = useRef<Map<number, string>>(
    new Map(initial ? [[initial.id, initial.label]] : []),
  );

  useEffect(() => {
    if (selected) labelCache.current.set(selected.id, selected.label);
  }, [selected]);

  const value: FKItem | null = useMemo(
    () =>
      selected
        ? { value: String(selected.id), label: selected.label }
        : null,
    [selected],
  );

  const itemsAsValues: FKItem[] = useMemo(() => {
    const all = [...items];
    // S'assure que la valeur sélectionnée reste présente dans la liste affichée
    // — sinon base-ui clignote en "Aucun résultat" puis perd l'item sélectionné.
    if (selected && !all.some((x) => x.id === selected.id)) {
      all.unshift(selected);
    }
    return all.map((o) => ({ value: String(o.id), label: o.label }));
  }, [items, selected]);

  function fetchResults(query: string) {
    startTransition(async () => {
      const results = await searchAction(query);
      for (const r of results) labelCache.current.set(r.id, r.label);
      setItems(results);
    });
  }

  function onInputValueChange(text: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(text), 200);
  }

  function onValueChange(next: FKItem | null) {
    if (!next) {
      setSelected(null);
      return;
    }
    const id = Number.parseInt(next.value, 10);
    if (!Number.isFinite(id)) return;
    const label = labelCache.current.get(id) ?? next.label;
    setSelected({ id, label });
  }

  return (
    <>
      <input
        type="hidden"
        name={name}
        value={selected ? String(selected.id) : ""}
        required={required}
        form={form}
      />
      <Combobox
        items={itemsAsValues}
        value={value}
        onValueChange={onValueChange}
        onInputValueChange={onInputValueChange}
        onOpenChange={(open) => {
          // Charge la première page de résultats à l'ouverture si rien n'a
          // encore été chargé pour le terme courant.
          if (open && items.length <= 1) fetchResults("");
        }}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
        disabled={disabled}
      >
        <ComboboxInput
          id={id}
          placeholder={placeholder ?? t("placeholder")}
          showClear={allowClear && selected != null}
          disabled={disabled}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {pending ? t("loading") : (emptyLabel ?? t("noResults"))}
          </ComboboxEmpty>
          <ComboboxList>
            {itemsAsValues.map((item) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </>
  );
}
