"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/form/form-field";
import { DateTimeInput } from "@/components/form/datetime-input";
import { useRouter } from "@/i18n/navigation";
import type { ChargeActionState } from "./ChargeTabs";

export type CarOption = { id: number; label: string };
export type PositionOption = { id: number; car_id: number; label: string };

export function ChargeCreateClient({
  cars,
  positionsByCar,
  readOnly,
  createAction,
}: {
  cars: CarOption[];
  positionsByCar: Record<number, PositionOption[]>;
  readOnly: boolean;
  createAction: (
    prev: ChargeActionState | null,
    formData: FormData,
  ) => Promise<ChargeActionState>;
}) {
  const t = useTranslations("charges");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const noCars = cars.length === 0;

  const [carId, setCarId] = useState<string>(cars[0]?.id ? String(cars[0].id) : "");
  const positions = useMemo(
    () => (carId ? positionsByCar[parseInt(carId, 10)] ?? [] : []),
    [carId, positionsByCar],
  );
  const [positionId, setPositionId] = useState<string>(
    positions[0]?.id ? String(positions[0].id) : "",
  );
  const [startDate, setStartDate] = useState(new Date().toISOString());

  // Si on change de voiture, on remet à zéro la position (sinon on garde une
  // FK incohérente). On le fait à la prochaine sélection plutôt qu'en effect
  // pour éviter la cascade de re-renders.
  function onCarChange(v: string) {
    setCarId(v);
    const next = positionsByCar[parseInt(v, 10)] ?? [];
    setPositionId(next[0]?.id ? String(next[0].id) : "");
  }

  const [state, formAction, pending] = useActionState<ChargeActionState | null, FormData>(
    createAction,
    null,
  );

  const rawFe = (state?.fieldErrors ?? {}) as Record<string, string>;
  const knownErrors = new Set([
    "carRequired",
    "positionRequired",
    "endBeforeStart",
    "invalidNumber",
  ]);
  const fe: Record<string, string> = Object.fromEntries(
    Object.entries(rawFe).map(([k, v]) => [
      k,
      knownErrors.has(v) ? t(`errors.${v}`) : v,
    ]),
  );

  const noPositions = !!carId && positions.length === 0;

  return (
    <form action={formAction} className="space-y-6">
      {readOnly ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {tCommon("readOnlyMode")}
        </div>
      ) : null}

      {noCars ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {t("errors.noCar")}
        </div>
      ) : null}

      {noPositions ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {t("errors.noPosition")}
        </div>
      ) : null}

      {state?.error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="car_id" label={t("fields.carId")} required error={fe.car_id}>
          <input type="hidden" name="car_id" value={carId} />
          <Select value={carId} onValueChange={(v) => onCarChange(typeof v === "string" ? v : "")} disabled={readOnly || noCars}>
            <SelectTrigger id="car_id" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cars.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          id="position_id"
          label={t("fields.positionId")}
          required
          error={fe.position_id}
        >
          <input type="hidden" name="position_id" value={positionId} />
          <Select
            value={positionId}
            onValueChange={(v) => setPositionId(typeof v === "string" ? v : "")}
            disabled={readOnly || noPositions}
          >
            <SelectTrigger id="position_id" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {positions.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          id="start_date"
          label={t("fields.startDate")}
          required
          error={fe.start_date}
        >
          <DateTimeInput
            id="start_date"
            name="start_date"
            value={startDate}
            onChange={(e) => setStartDate((e.target as HTMLInputElement).value)}
            required
            disabled={readOnly}
          />
        </FormField>
      </div>

      <Separator />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || readOnly || noCars || noPositions}>
          {pending ? tCommon("saving") : t("actions.create")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/charges")}
          disabled={pending}
        >
          {tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}
