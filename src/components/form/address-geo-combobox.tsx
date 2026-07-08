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
import { searchAddressOptionsWithCoords } from "@/app/actions/search-addresses";
import type { FKOption } from "@/components/form/fk-combobox";

type GeoItem = {
  key: string;
  label: string;
  addressId: number | null;
  lat: number;
  lon: number;
};

/**
 * Combobox de sélection d'une adresse **déjà présente en base** (recherche
 * ILIKE sur la table `addresses`). À la sélection, poste l'id de l'adresse
 * (input caché, `required`) — compatible avec un `<form action={…}>` natif.
 * Quand la recherche ne renvoie aucune adresse, propose un lien ouvrant une
 * boîte de dialogue de création d'adresse pré-remplie (géocodage).
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
    startTransition(async () => {
      try {
        const rows = await searchAddressOptionsWithCoords(q);
        setItems(
          rows.map((r) => ({
            key: `addr:${r.id}`,
            label: r.label,
            addressId: r.id,
            lat: r.lat,
            lon: r.lon,
          })),
        );
      } catch {
        toast.error(tCommon("errorOccurred"));
        setItems([]);
      }
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
    setSelected(next);
    if (next.addressId != null) {
      onAddressSelected?.(next.lat, next.lon);
    }
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
