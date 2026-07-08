"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { AddressCreateDialog } from "@/components/entities/addresses/AddressCreateDialog";
import { geocodeAddressAction } from "@/app/actions/geocode-address";
import { createAddressFromGeoAction } from "@/app/actions/create-address-from-geo";
import type { GeoSuggestion } from "@/lib/geo/types";
import type { FKOption } from "@/components/form/fk-combobox";

type GeoItem = {
  key: string;
  label: string;
  suggestion: GeoSuggestion | null;
  addressId: number | null;
  lat: number;
  lon: number;
};

/**
 * Combobox d'adresse géocodée (Nominatim). À la sélection, crée/associe
 * l'adresse en base et poste son id (input caché, `required`) — compatible avec
 * un `<form action={…}>` natif. Quand la recherche ne renvoie rien, propose un
 * lien ouvrant une boîte de dialogue de création d'adresse pré-remplie.
 *
 * `onAddressSelected(lat, lon)` permet au parent (assistant de trajet) de
 * déclencher l'auto-sélection de géofence et l'activation du bouton Calculer.
 */
export function AddressGeoCombobox({
  name,
  onAddressSelected,
  onCleared,
  disabled = false,
  id,
  required = false,
  placeholder,
}: {
  name: string;
  onAddressSelected?: (lat: number, lon: number) => void;
  onCleared?: () => void;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const t = useTranslations("drives");
  const tCommon = useTranslations("common");

  const [items, setItems] = useState<GeoItem[]>([]);
  const [selected, setSelected] = useState<GeoItem | null>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fetchResults(q: string) {
    if (q.trim() === "") {
      setItems([]);
      return;
    }
    startTransition(async () => {
      const res = await geocodeAddressAction(q);
      if (!res.ok) {
        toast.error(res.error);
        setItems([]);
        return;
      }
      setItems(
        res.suggestions.map((s) => ({
          key: s.key,
          label: s.label,
          suggestion: s,
          addressId: null,
          lat: s.lat,
          lon: s.lon,
        })),
      );
    });
  }

  function onInputValueChange(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(text), 200);
  }

  function selectCreatedAddress(option: FKOption, lat: number, lon: number) {
    const item: GeoItem = {
      key: `addr:${option.id}`,
      label: option.label,
      suggestion: null,
      addressId: option.id,
      lat,
      lon,
    };
    setSelected(item);
    onAddressSelected?.(lat, lon);
  }

  function onValueChange(next: GeoItem | null) {
    if (!next) {
      setSelected(null);
      onCleared?.();
      return;
    }
    if (next.addressId != null) {
      setSelected(next);
      onAddressSelected?.(next.lat, next.lon);
      return;
    }
    if (!next.suggestion) return;
    // Sélection d'un candidat géocodé → création/association de l'adresse.
    const suggestion = next.suggestion;
    setSelected({ ...next }); // optimiste : affiche le libellé immédiatement
    startTransition(async () => {
      const res = await createAddressFromGeoAction(suggestion.values);
      if (!res.ok) {
        toast.error(res.error);
        setSelected(null);
        onCleared?.();
        return;
      }
      selectCreatedAddress(res.option, res.lat, res.lon);
    });
  }

  const itemsForList: GeoItem[] = useMemo(() => {
    const all = [...items];
    if (selected && !all.some((x) => x.key === selected.key)) {
      all.unshift(selected);
    }
    return all;
  }, [items, selected]);

  return (
    <>
      <input
        type="hidden"
        name={name}
        value={selected?.addressId != null ? String(selected.addressId) : ""}
        required={required}
      />
      <Combobox
        items={itemsForList}
        value={selected}
        onValueChange={onValueChange}
        onInputValueChange={onInputValueChange}
        itemToStringLabel={(item: GeoItem) => item.label}
        itemToStringValue={(item: GeoItem) => item.key}
        disabled={disabled}
      >
        <ComboboxInput
          id={id}
          placeholder={placeholder ?? t("geo.searchPlaceholder")}
          showClear={selected != null}
          disabled={disabled}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            <div className="flex flex-col items-center gap-2 px-2 py-1">
              <span>{pending ? tCommon("loading") : t("geo.noResults")}</span>
              {!pending && query.trim() !== "" ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDialogOpen(true);
                  }}
                >
                  {t("geo.createAddress")}
                </Button>
              ) : null}
            </div>
          </ComboboxEmpty>
          <ComboboxList>
            {itemsForList.map((item) => (
              <ComboboxItem key={item.key} value={item}>
                {item.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {dialogOpen ? (
        <AddressCreateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialQuery={query}
          onCreated={selectCreatedAddress}
        />
      ) : null}
    </>
  );
}
