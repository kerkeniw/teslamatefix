"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/form/form-field";
import { DateTimeInput } from "@/components/form/datetime-input";
import { FKCombobox, type FKOption } from "@/components/form/fk-combobox";
import { searchPositionsAction } from "@/app/actions/search-positions";
import { useRouter } from "@/i18n/navigation";
import type { ChargeActionState } from "./ChargeTabs";

export function ChargeCreateClient({
  car,
  hasCar,
  readOnly,
  createAction,
}: {
  car: FKOption | null;
  hasCar: boolean;
  readOnly: boolean;
  createAction: (
    prev: ChargeActionState | null,
    formData: FormData,
  ) => Promise<ChargeActionState>;
}) {
  const t = useTranslations("charges");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [startDate, setStartDate] = useState(new Date().toISOString());

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

  return (
    <form action={formAction} className="space-y-6">
      {readOnly ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {tCommon("readOnlyMode")}
        </div>
      ) : null}

      {!hasCar ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {t("errors.noCar")}
        </div>
      ) : null}

      {state?.error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      <input type="hidden" name="car_id" value={car ? String(car.id) : ""} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="car_label" label={t("fields.carId")}>
          <p className="text-sm">
            {car?.label ?? "—"}
          </p>
        </FormField>

        <FormField
          id="position_id"
          label={t("fields.positionId")}
          required
          error={fe.position_id}
        >
          <FKCombobox
            id="position_id"
            name="position_id"
            initial={null}
            searchAction={searchPositionsAction}
            disabled={readOnly || !hasCar}
            required
          />
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
        <Button type="submit" disabled={pending || readOnly || !hasCar}>
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
