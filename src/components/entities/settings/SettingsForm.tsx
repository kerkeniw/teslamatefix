"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useEffect, useRef } from "react";
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
import { useState } from "react";

export type SettingsFormValues = {
  unit_of_length: "km" | "mi";
  unit_of_temperature: "C" | "F";
  unit_of_pressure: "bar" | "psi";
  preferred_range: "ideal" | "rated";
  language: string;
  base_url: string;
  grafana_url: string;
};

export type SettingsFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof SettingsFormValues, string>>;
};

export type SettingsFormProps = {
  initial: SettingsFormValues;
  readOnly?: boolean;
  saveAction: (
    prev: SettingsFormState | null,
    formData: FormData,
  ) => Promise<SettingsFormState>;
};

export function SettingsForm({ initial, readOnly = false, saveAction }: SettingsFormProps) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");

  const [state, formAction, pending] = useActionState<
    SettingsFormState | null,
    FormData
  >(saveAction, null);

  const [unitLength, setUnitLength] = useState<string>(initial.unit_of_length);
  const [unitTemp, setUnitTemp] = useState<string>(initial.unit_of_temperature);
  const [unitPressure, setUnitPressure] = useState<string>(initial.unit_of_pressure);
  const [preferredRange, setPreferredRange] = useState<string>(initial.preferred_range);

  const lastOk = useRef<SettingsFormState | null>(null);
  useEffect(() => {
    if (state?.ok && state !== lastOk.current) {
      lastOk.current = state;
      toast.success(t("saved"));
    }
  }, [state, t]);

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
        <h2 className="text-base font-semibold">{t("sections.units")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="unit_of_length" label={t("fields.unitOfLength")} error={fe.unit_of_length}>
            <input type="hidden" name="unit_of_length" value={unitLength} />
            <Select
              value={unitLength}
              onValueChange={(v) => setUnitLength(typeof v === "string" ? v : "")}
              disabled={readOnly}
            >
              <SelectTrigger id="unit_of_length" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="km">{t("values.km")}</SelectItem>
                <SelectItem value="mi">{t("values.mi")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField id="unit_of_temperature" label={t("fields.unitOfTemperature")} error={fe.unit_of_temperature}>
            <input type="hidden" name="unit_of_temperature" value={unitTemp} />
            <Select
              value={unitTemp}
              onValueChange={(v) => setUnitTemp(typeof v === "string" ? v : "")}
              disabled={readOnly}
            >
              <SelectTrigger id="unit_of_temperature" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="C">{t("values.C")}</SelectItem>
                <SelectItem value="F">{t("values.F")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField id="unit_of_pressure" label={t("fields.unitOfPressure")} error={fe.unit_of_pressure}>
            <input type="hidden" name="unit_of_pressure" value={unitPressure} />
            <Select
              value={unitPressure}
              onValueChange={(v) => setUnitPressure(typeof v === "string" ? v : "")}
              disabled={readOnly}
            >
              <SelectTrigger id="unit_of_pressure" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">{t("values.bar")}</SelectItem>
                <SelectItem value="psi">{t("values.psi")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.display")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="preferred_range" label={t("fields.preferredRange")} error={fe.preferred_range}>
            <input type="hidden" name="preferred_range" value={preferredRange} />
            <Select
              value={preferredRange}
              onValueChange={(v) => setPreferredRange(typeof v === "string" ? v : "")}
              disabled={readOnly}
            >
              <SelectTrigger id="preferred_range" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ideal">{t("values.ideal")}</SelectItem>
                <SelectItem value="rated">{t("values.rated")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="language"
            label={t("fields.language")}
            hint={t("hints.language")}
            error={fe.language}
          >
            <Input
              id="language"
              name="language"
              defaultValue={initial.language}
              maxLength={8}
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.urls")}</h2>
        <div className="grid gap-4">
          <FormField
            id="base_url"
            label={t("fields.baseUrl")}
            hint={t("hints.baseUrl")}
            error={fe.base_url}
          >
            <Input
              id="base_url"
              name="base_url"
              type="url"
              defaultValue={initial.base_url}
              maxLength={255}
              placeholder="https://teslamate.example.com"
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="grafana_url"
            label={t("fields.grafanaUrl")}
            hint={t("hints.grafanaUrl")}
            error={fe.grafana_url}
          >
            <Input
              id="grafana_url"
              name="grafana_url"
              type="url"
              defaultValue={initial.grafana_url}
              maxLength={255}
              placeholder="https://grafana.example.com"
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <div>
        <Button type="submit" disabled={pending || readOnly}>
          {pending ? tCommon("saving") : t("actions.save")}
        </Button>
      </div>
    </form>
  );
}
