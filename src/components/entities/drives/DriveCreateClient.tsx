"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DriveForm,
  type DriveFormValues,
  type DriveFormInitialOptions,
} from "./DriveForm";
import { DriveLocationPanel } from "./DriveLocationPanel";
import type { DriveActionState } from "./DriveTabs";
import { useRouter } from "@/i18n/navigation";

const DRIVE_CREATE_FORM_ID = "drive-create-form";

export function DriveCreateClient({
  initial,
  initialOptions,
  hasCar,
  readOnly,
  createAction,
}: {
  initial: DriveFormValues;
  initialOptions: DriveFormInitialOptions;
  hasCar: boolean;
  readOnly: boolean;
  createAction: (
    prev: DriveActionState | null,
    formData: FormData,
  ) => Promise<DriveActionState>;
}) {
  const t = useTranslations("drives");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [state, formAction, pending] = useActionState<DriveActionState | null, FormData>(
    createAction,
    null,
  );

  const rawFe = (state?.fieldErrors ?? {}) as Record<string, string>;
  const knownErrors = new Set(["endBeforeStart", "carRequired", "invalidNumber"]);
  const fe: Record<string, string> = Object.fromEntries(
    Object.entries(rawFe).map(([k, v]) => [
      k,
      knownErrors.has(v) ? t(`errors.${v}`) : v,
    ]),
  );

  return (
    <form action={formAction} id={DRIVE_CREATE_FORM_ID} className="space-y-6">
      {readOnly ? (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
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

      <DriveForm
        initial={initial}
        initialOptions={initialOptions}
        fieldErrors={fe}
        readOnly={readOnly}
        mode="create"
        locationPanel={
          <DriveLocationPanel
            formId={DRIVE_CREATE_FORM_ID}
            initial={{
              start_km: initial.start_km,
              end_km: initial.end_km,
              distance: initial.distance,
            }}
            startAddress={initialOptions.startAddress}
            endAddress={initialOptions.endAddress}
            startGeofence={initialOptions.startGeofence}
            endGeofence={initialOptions.endGeofence}
            track={[]}
            fieldErrors={fe}
            readOnly={readOnly}
          />
        }
      />

      <Separator />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || readOnly || !hasCar}>
          {pending ? tCommon("saving") : t("actions.create")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/drives")}
          disabled={pending}
        >
          {tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}
