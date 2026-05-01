"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";

export type CarFormValues = {
  name: string;
  vin: string;
  eid: string;
  vid: string;
  model: string;
  marketing_name: string;
  trim_badging: string;
  exterior_color: string;
  spoiler_type: string;
  wheel_type: string;
  display_priority: string;
  efficiency: string;
};

export type CarFieldErrors = Partial<Record<keyof CarFormValues, string>>;

/**
 * Sous-formulaire pour les champs de la table `cars` (hors timestamps et
 * settings_id qui est géré côté serveur). Les identifiants Tesla (eid, vid, vin)
 * sont en lecture seule : ils sont set par TeslaMate à l'enrôlement et toute
 * modification briserait la correspondance avec l'API Tesla.
 */
export function CarForm({
  initial,
  fieldErrors = {},
  readOnly = false,
}: {
  initial: CarFormValues;
  fieldErrors?: CarFieldErrors;
  readOnly?: boolean;
}) {
  const t = useTranslations("cars");
  const fe = fieldErrors;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.identity")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="name" label={t("fields.name")} error={fe.name}>
            <Input
              id="name"
              name="name"
              defaultValue={initial.name}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="vin" label={t("fields.vin")} error={fe.vin}>
            <Input
              id="vin"
              name="vin"
              defaultValue={initial.vin}
              maxLength={32}
              readOnly
              disabled
              className="font-mono"
            />
          </FormField>
          <FormField id="eid" label={t("fields.eid")} error={fe.eid}>
            <Input id="eid" name="eid" defaultValue={initial.eid} readOnly disabled className="font-mono" />
          </FormField>
          <FormField id="vid" label={t("fields.vid")} error={fe.vid}>
            <Input id="vid" name="vid" defaultValue={initial.vid} readOnly disabled className="font-mono" />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.model")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="model" label={t("fields.model")} error={fe.model}>
            <Input
              id="model"
              name="model"
              defaultValue={initial.model}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="marketing_name" label={t("fields.marketingName")} error={fe.marketing_name}>
            <Input
              id="marketing_name"
              name="marketing_name"
              defaultValue={initial.marketing_name}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="trim_badging" label={t("fields.trimBadging")} error={fe.trim_badging}>
            <Input
              id="trim_badging"
              name="trim_badging"
              defaultValue={initial.trim_badging}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="efficiency"
            label={t("fields.efficiency")}
            hint={t("hints.efficiency")}
            error={fe.efficiency}
          >
            <NumberInput
              id="efficiency"
              name="efficiency"
              defaultValue={initial.efficiency}
              step="0.001"
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.options")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="exterior_color" label={t("fields.exteriorColor")} error={fe.exterior_color}>
            <Input
              id="exterior_color"
              name="exterior_color"
              defaultValue={initial.exterior_color}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="spoiler_type" label={t("fields.spoilerType")} error={fe.spoiler_type}>
            <Input
              id="spoiler_type"
              name="spoiler_type"
              defaultValue={initial.spoiler_type}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="wheel_type" label={t("fields.wheelType")} error={fe.wheel_type}>
            <Input
              id="wheel_type"
              name="wheel_type"
              defaultValue={initial.wheel_type}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="display_priority"
            label={t("fields.displayPriority")}
            hint={t("hints.displayPriority")}
            error={fe.display_priority}
          >
            <NumberInput
              id="display_priority"
              name="display_priority"
              defaultValue={initial.display_priority}
              step="1"
              min={1}
              max={32767}
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>
    </div>
  );
}
