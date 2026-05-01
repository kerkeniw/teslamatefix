"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { ConfirmDialog } from "@/components/tesla/confirm-dialog";
import { useRouter } from "@/i18n/navigation";

export type GeofenceFormValues = {
  name: string;
  latitude: string;
  longitude: string;
  radius: string;
  billing_type: "per_kwh" | "per_minute";
  cost_per_unit: string;
  session_fee: string;
};

export type GeofenceFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof GeofenceFormValues, string>>;
};

export type GeofenceFormProps = {
  mode: "create" | "edit";
  initial: GeofenceFormValues;
  id?: number;
  drivesCount?: number;
  chargingCount?: number;
  readOnly?: boolean;
  saveAction: (
    prev: GeofenceFormState | null,
    formData: FormData,
  ) => Promise<GeofenceFormState>;
  deleteAction?: () => Promise<{ ok: boolean; error?: string }>;
};

export function GeofenceForm({
  mode,
  initial,
  id,
  drivesCount = 0,
  chargingCount = 0,
  readOnly = false,
  saveAction,
  deleteAction,
}: GeofenceFormProps) {
  const t = useTranslations("geofences");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [billingType, setBillingType] = useState<"per_kwh" | "per_minute">(
    initial.billing_type,
  );

  const [state, formAction, pending] = useActionState<
    GeofenceFormState | null,
    FormData
  >(saveAction, null);

  async function handleDelete() {
    if (!deleteAction) return;
    const result = await deleteAction();
    if (result.ok) {
      toast.success(tCommon("deleted"));
      router.push("/geofences");
    } else {
      toast.error(result.error ?? tCommon("errorOccurred"));
    }
  }

  const fe = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-8">
      {readOnly ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {tCommon("readOnlyMode")}
        </div>
      ) : null}

      {state?.error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.identity")}</h2>
        <FormField id="name" label={t("fields.name")} required error={fe.name}>
          <Input
            id="name"
            name="name"
            defaultValue={initial.name}
            maxLength={255}
            required
            disabled={readOnly}
          />
        </FormField>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.location")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="latitude"
            label={t("fields.latitude")}
            required
            error={fe.latitude}
          >
            <NumberInput
              id="latitude"
              name="latitude"
              defaultValue={initial.latitude}
              step="0.000001"
              min={-90}
              max={90}
              required
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="longitude"
            label={t("fields.longitude")}
            required
            error={fe.longitude}
          >
            <NumberInput
              id="longitude"
              name="longitude"
              defaultValue={initial.longitude}
              step="0.000001"
              min={-180}
              max={180}
              required
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="radius"
            label={t("fields.radius")}
            hint={t("hints.radius")}
            required
            error={fe.radius}
          >
            <NumberInput
              id="radius"
              name="radius"
              defaultValue={initial.radius}
              step={1}
              min={1}
              max={32767}
              required
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.billing")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="billing_type" label={t("fields.billingType")} error={fe.billing_type}>
            <input type="hidden" name="billing_type" value={billingType} />
            <Select
              value={billingType}
              onValueChange={(v) => {
                if (v === "per_kwh" || v === "per_minute") setBillingType(v);
              }}
              disabled={readOnly}
            >
              <SelectTrigger id="billing_type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="per_kwh">{t("billingType.per_kwh")}</SelectItem>
                <SelectItem value="per_minute">{t("billingType.per_minute")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            id="cost_per_unit"
            label={t("fields.costPerUnit")}
            hint={t("hints.costPerUnit")}
            error={fe.cost_per_unit}
          >
            <NumberInput
              id="cost_per_unit"
              name="cost_per_unit"
              defaultValue={initial.cost_per_unit}
              step="0.0001"
              min={0}
              max={99.9999}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="session_fee"
            label={t("fields.sessionFee")}
            hint={t("hints.sessionFee")}
            error={fe.session_fee}
          >
            <NumberInput
              id="session_fee"
              name="session_fee"
              defaultValue={initial.session_fee}
              step="0.01"
              min={0}
              max={9999.99}
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || readOnly}>
            {pending
              ? tCommon("saving")
              : mode === "create"
                ? t("actions.create")
                : t("actions.save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/geofences")}
            disabled={pending}
          >
            {tCommon("cancel")}
          </Button>
        </div>
        {mode === "edit" && deleteAction && id !== undefined ? (
          <ConfirmDialog
            destructive
            title={t("delete.title")}
            description={t("delete.description", {
              drives: drivesCount,
              charging: chargingCount,
            })}
            confirmLabel={t("delete.confirm")}
            cancelLabel={tCommon("cancel")}
            onConfirm={handleDelete}
            trigger={
              <Button type="button" variant="destructive" disabled={pending || readOnly}>
                <Trash2 className="size-4" aria-hidden />
                {t("actions.delete")}
              </Button>
            }
          />
        ) : null}
      </div>
    </form>
  );
}
