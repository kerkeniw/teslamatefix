"use client";

import { useTransition } from "react";
import { Car as CarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setSelectedCarAction } from "@/app/actions/select-vehicle";
import type { CarOption } from "@/lib/vehicle";

/**
 * Sélecteur de véhicule global affiché dans le header.
 *
 * - 0 véhicule : composant nul.
 * - 1 seul véhicule : libellé statique (pas de combo).
 * - 2+ véhicules : `<Select>` shadcn ; au changement, la server action
 *   `setSelectedCarAction` persiste l'id dans le cookie `tmfix_car_id` et
 *   revalide la layout (dashboard et listes d'entités refiltrent).
 *
 * On utilise `useTransition` pour bloquer le composant pendant la
 * server action et éviter qu'un double-click ne provoque deux refetch.
 */
export function VehiclePicker({
  cars,
  selectedId,
}: {
  cars: CarOption[];
  selectedId: number;
}) {
  const t = useTranslations("vehiclePicker");
  const [pending, startTransition] = useTransition();

  if (cars.length === 0) return null;

  if (cars.length === 1) {
    const c = cars[0];
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs text-muted-foreground"
        title={c.vinShort ? `VIN …${c.vinShort}` : undefined}
      >
        <CarIcon className="size-3.5" aria-hidden />
        <span className="max-w-[12ch] truncate">{c.label}</span>
      </span>
    );
  }

  const selected = cars.find((c) => c.id === selectedId) ?? cars[0];

  function onChange(value: unknown) {
    if (typeof value !== "string") return;
    const id = Number.parseInt(value, 10);
    if (!Number.isFinite(id)) return;
    if (id === selected.id) return;
    startTransition(() => {
      void setSelectedCarAction(id);
    });
  }

  return (
    <Select value={String(selected.id)} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        size="sm"
        aria-label={t("label")}
        className="min-w-[10rem]"
      >
        <CarIcon className="size-3.5" aria-hidden />
        <SelectValue>
          {(value) => {
            const c = cars.find((x) => String(x.id) === String(value));
            return c?.label ?? value ?? t("placeholder");
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {cars.map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>
            {c.label}
            {c.vinShort ? (
              <span className="ml-2 text-xs text-muted-foreground">
                …{c.vinShort}
              </span>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
