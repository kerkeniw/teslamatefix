"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form/form-field";
import { geocodeAddressAction } from "@/app/actions/geocode-address";
import { createAddressFromGeoAction } from "@/app/actions/create-address-from-geo";
import type { GeoSuggestion } from "@/lib/geo/types";
import type { FKOption } from "@/components/form/fk-combobox";

type DialogItem = { key: string; label: string; suggestion: GeoSuggestion };

/**
 * Boîte de dialogue de création d'adresse à partir du géocodeur. Reprend le
 * texte de recherche initial, liste les adresses les plus proches, et à la
 * sélection remplit tous les champs de l'entité + active « Sauvegarder ».
 */
export function AddressCreateDialog({
  open,
  onOpenChange,
  initialQuery,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  onCreated: (option: FKOption, lat: number, lon: number) => void;
}) {
  const t = useTranslations("addresses");
  const tCommon = useTranslations("common");

  const [items, setItems] = useState<DialogItem[]>([]);
  const [selected, setSelected] = useState<GeoSuggestion | null>(null);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runSearch(query: string) {
    const q = query.trim();
    if (q === "") {
      setItems([]);
      return;
    }
    startSearch(async () => {
      const res = await geocodeAddressAction(q);
      if (!res.ok) {
        toast.error(res.error);
        setItems([]);
        return;
      }
      setItems(
        res.suggestions.map((s) => ({
          key: s.key,
          label: s.values.display_name || s.label,
          suggestion: s,
        })),
      );
    });
  }

  // Recherche initiale au montage (le composant n'est monté qu'à l'ouverture,
  // cf. rendu conditionnel côté parent). On défère via un timer pour ne pas
  // déclencher de setState synchrone dans le corps de l'effet.
  useEffect(() => {
    const id = setTimeout(() => {
      if (initialQuery.trim() !== "") runSearch(initialQuery);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onInputValueChange(text: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 200);
  }

  function handleSave() {
    if (!selected) return;
    startSave(async () => {
      const res = await createAddressFromGeoAction(selected.values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(tCommon("saved"));
      onCreated(res.option, res.lat, res.lon);
      onOpenChange(false);
    });
  }

  const v = selected?.values;
  const value = selected
    ? { key: selected.key, label: selected.values.display_name || "", suggestion: selected }
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("geoDialog.title")}</DialogTitle>
          <DialogDescription>{t("geoDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField id="geo-search" label={t("fields.displayName")}>
            <Combobox
              items={items}
              value={value}
              onValueChange={(item: DialogItem | null) => {
                setSelected(item ? item.suggestion : null);
              }}
              onInputValueChange={onInputValueChange}
              itemToStringLabel={(item) => item?.label ?? ""}
              itemToStringValue={(item) => item?.key ?? ""}
            >
              <ComboboxInput id="geo-search" placeholder={t("geoDialog.searchPlaceholder")} />
              <ComboboxContent>
                <ComboboxEmpty>
                  {searching ? tCommon("loading") : t("geoDialog.noResults")}
                </ComboboxEmpty>
                <ComboboxList>
                  {items.map((item) => (
                    <ComboboxItem key={item.key} value={item}>
                      {item.label}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </FormField>

          {v ? (
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
              <FormField id="geo-house" label={t("fields.houseNumber")}>
                <Input value={v.house_number ?? ""} readOnly disabled />
              </FormField>
              <FormField id="geo-road" label={t("fields.road")}>
                <Input value={v.road ?? ""} readOnly disabled />
              </FormField>
              <FormField id="geo-postcode" label={t("fields.postcode")}>
                <Input value={v.postcode ?? ""} readOnly disabled />
              </FormField>
              <FormField id="geo-city" label={t("fields.city")}>
                <Input value={v.city ?? ""} readOnly disabled />
              </FormField>
              <FormField id="geo-country" label={t("fields.country")}>
                <Input value={v.country ?? ""} readOnly disabled />
              </FormField>
              <FormField id="geo-coords" label={`${t("fields.latitude")} / ${t("fields.longitude")}`}>
                <Input value={`${v.latitude ?? ""}, ${v.longitude ?? ""}`} readOnly disabled />
              </FormField>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!selected || saving}>
            {saving ? tCommon("saving") : t("actions.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
