"use client";

import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";

export type CarSettingsValues = {
  suspend_min: string;
  suspend_after_idle_min: string;
  req_not_unlocked: boolean;
  free_supercharging: boolean;
  use_streaming_api: boolean;
  enabled: boolean;
  lfp_battery: boolean;
};

export type CarSettingsFieldErrors = Partial<Record<keyof CarSettingsValues, string>>;

/**
 * Toggle accessible (input checkbox stylé). On évite Switch pour ne pas
 * dépendre d'un composant non livré dans la liste shadcn de ce projet, et
 * pour rester compatible avec une soumission native de FormData.
 */
function Toggle({
  id,
  name,
  defaultChecked,
  disabled,
  label,
}: {
  id: string;
  name: string;
  defaultChecked: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-md border bg-card/50 px-3 py-2 text-sm has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60"
    >
      <span>{label}</span>
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="size-4 cursor-pointer accent-tesla-red disabled:cursor-not-allowed"
        value="1"
      />
    </label>
  );
}

export function CarSettingsForm({
  initial,
  fieldErrors = {},
  readOnly = false,
}: {
  initial: CarSettingsValues;
  fieldErrors?: CarSettingsFieldErrors;
  readOnly?: boolean;
}) {
  const t = useTranslations("cars");
  const fe = fieldErrors;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.polling")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="suspend_min"
            label={t("fields.suspendMin")}
            hint={t("hints.suspendMin")}
            error={fe.suspend_min}
          >
            <NumberInput
              id="suspend_min"
              name="suspend_min"
              defaultValue={initial.suspend_min}
              step="1"
              min={0}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="suspend_after_idle_min"
            label={t("fields.suspendAfterIdleMin")}
            hint={t("hints.suspendAfterIdleMin")}
            error={fe.suspend_after_idle_min}
          >
            <NumberInput
              id="suspend_after_idle_min"
              name="suspend_after_idle_min"
              defaultValue={initial.suspend_after_idle_min}
              step="1"
              min={0}
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.flags")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            id="enabled"
            name="enabled"
            defaultChecked={initial.enabled}
            disabled={readOnly}
            label={t("fields.enabled")}
          />
          <Toggle
            id="use_streaming_api"
            name="use_streaming_api"
            defaultChecked={initial.use_streaming_api}
            disabled={readOnly}
            label={t("fields.useStreamingApi")}
          />
          <Toggle
            id="req_not_unlocked"
            name="req_not_unlocked"
            defaultChecked={initial.req_not_unlocked}
            disabled={readOnly}
            label={t("fields.reqNotUnlocked")}
          />
          <Toggle
            id="free_supercharging"
            name="free_supercharging"
            defaultChecked={initial.free_supercharging}
            disabled={readOnly}
            label={t("fields.freeSupercharging")}
          />
          <Toggle
            id="lfp_battery"
            name="lfp_battery"
            defaultChecked={initial.lfp_battery}
            disabled={readOnly}
            label={t("fields.lfpBattery")}
          />
        </div>
        {fe.lfp_battery || fe.enabled ? (
          <p role="alert" className="text-xs text-destructive">
            {fe.lfp_battery ?? fe.enabled}
          </p>
        ) : null}
      </section>
    </div>
  );
}
