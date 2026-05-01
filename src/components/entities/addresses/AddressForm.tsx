"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { ConfirmDialog } from "@/components/tesla/confirm-dialog";
import { Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

export type AddressFormValues = {
  display_name: string | null;
  name: string | null;
  house_number: string | null;
  road: string | null;
  neighbourhood: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  state: string | null;
  state_district: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  osm_id: string | null;
  osm_type: string | null;
  raw: string;
};

export type AddressFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof AddressFormValues, string>>;
};

export type AddressFormProps = {
  mode: "create" | "edit";
  initial: AddressFormValues;
  id?: number;
  drivesCount?: number;
  chargingCount?: number;
  readOnly?: boolean;
  saveAction: (
    prev: AddressFormState | null,
    formData: FormData,
  ) => Promise<AddressFormState>;
  deleteAction?: () => Promise<{ ok: boolean; error?: string }>;
};

export function AddressForm({
  mode,
  initial,
  id,
  drivesCount = 0,
  chargingCount = 0,
  readOnly = false,
  saveAction,
  deleteAction,
}: AddressFormProps) {
  const t = useTranslations("addresses");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [rawValue, setRawValue] = useState(initial.raw);
  const [rawError, setRawError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<
    AddressFormState | null,
    FormData
  >(saveAction, null);

  function validateRaw(v: string): boolean {
    const trimmed = v.trim();
    if (trimmed === "") {
      setRawError(null);
      return true;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setRawError(t("errors.invalidRaw"));
        return false;
      }
      setRawError(null);
      return true;
    } catch {
      setRawError(tCommon("invalidJson"));
      return false;
    }
  }

  async function handleDelete() {
    if (!deleteAction) return;
    const result = await deleteAction();
    if (result.ok) {
      toast.success(tCommon("deleted"));
      router.push("/addresses");
    } else {
      toast.error(result.error ?? tCommon("errorOccurred"));
    }
  }

  const fe = state?.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="space-y-8"
      onSubmit={(e) => {
        if (!validateRaw(rawValue)) {
          e.preventDefault();
        }
      }}
    >
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
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="display_name"
            label={t("fields.displayName")}
            hint={t("hints.displayName")}
            error={fe.display_name}
            className="sm:col-span-2"
          >
            <Input
              id="display_name"
              name="display_name"
              defaultValue={initial.display_name ?? ""}
              maxLength={512}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="name" label={t("fields.name")} error={fe.name}>
            <Input
              id="name"
              name="name"
              defaultValue={initial.name ?? ""}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.location")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="latitude"
            label={t("fields.latitude")}
            hint={t("hints.lat")}
            error={fe.latitude}
          >
            <NumberInput
              id="latitude"
              name="latitude"
              defaultValue={initial.latitude ?? ""}
              step="0.000001"
              min={-90}
              max={90}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="longitude"
            label={t("fields.longitude")}
            hint={t("hints.lon")}
            error={fe.longitude}
          >
            <NumberInput
              id="longitude"
              name="longitude"
              defaultValue={initial.longitude ?? ""}
              step="0.000001"
              min={-180}
              max={180}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="house_number" label={t("fields.houseNumber")} error={fe.house_number}>
            <Input
              id="house_number"
              name="house_number"
              defaultValue={initial.house_number ?? ""}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="road" label={t("fields.road")} error={fe.road}>
            <Input
              id="road"
              name="road"
              defaultValue={initial.road ?? ""}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="neighbourhood" label={t("fields.neighbourhood")} error={fe.neighbourhood}>
            <Input
              id="neighbourhood"
              name="neighbourhood"
              defaultValue={initial.neighbourhood ?? ""}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="city" label={t("fields.city")} error={fe.city}>
            <Input
              id="city"
              name="city"
              defaultValue={initial.city ?? ""}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="county" label={t("fields.county")} error={fe.county}>
            <Input
              id="county"
              name="county"
              defaultValue={initial.county ?? ""}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="postcode" label={t("fields.postcode")} error={fe.postcode}>
            <Input
              id="postcode"
              name="postcode"
              defaultValue={initial.postcode ?? ""}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="state" label={t("fields.state")} error={fe.state}>
            <Input
              id="state"
              name="state"
              defaultValue={initial.state ?? ""}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="state_district" label={t("fields.stateDistrict")} error={fe.state_district}>
            <Input
              id="state_district"
              name="state_district"
              defaultValue={initial.state_district ?? ""}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="country" label={t("fields.country")} error={fe.country}>
            <Input
              id="country"
              name="country"
              defaultValue={initial.country ?? ""}
              maxLength={255}
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.osm")}</h2>
        <p className="text-xs text-muted-foreground">{t("hints.osmReadOnly")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="osm_id" label={t("fields.osmId")}>
            <Input
              id="osm_id"
              name="osm_id"
              defaultValue={initial.osm_id ?? ""}
              readOnly
              disabled
            />
          </FormField>
          <FormField id="osm_type" label={t("fields.osmType")}>
            <Input
              id="osm_type"
              name="osm_type"
              defaultValue={initial.osm_type ?? ""}
              readOnly
              disabled
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.raw")}</h2>
        <FormField
          id="raw"
          label={t("fields.raw")}
          hint={t("hints.rawPaste")}
          error={rawError ?? fe.raw}
        >
          <textarea
            id="raw"
            name="raw"
            value={rawValue}
            onChange={(e) => {
              setRawValue(e.target.value);
              if (rawError) validateRaw(e.target.value);
            }}
            onBlur={(e) => validateRaw(e.target.value)}
            disabled={readOnly}
            rows={10}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder='{ "place_id": 12345, ... }'
          />
        </FormField>
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
            onClick={() => router.push("/addresses")}
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
