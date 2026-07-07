"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/tesla/confirm-dialog";
import {
  DriveForm,
  type DriveFormValues,
  type DriveFormInitialOptions,
} from "./DriveForm";
import { DriveLocationPanel } from "./DriveLocationPanel";
import type { TrackPoint } from "./DriveTrackMap";
import { DriveCorrectionDialog } from "./DriveCorrectionDialog";
import type { DriveCorrectionSerialized } from "@/lib/integrity/drives";
import { useRouter } from "@/i18n/navigation";

const DRIVE_FORM_ID = "drive-edit-form";

export type DriveActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export function DriveTabs({
  id,
  initial,
  initialOptions,
  track,
  efficiency,
  anomalyReasons,
  correctAction,
  applyCorrectAction,
  readOnly,
  saveAction,
  deleteAction,
  positionsTab,
}: {
  id: number;
  initial: DriveFormValues;
  initialOptions: DriveFormInitialOptions;
  track: TrackPoint[];
  efficiency: number | null;
  anomalyReasons: string[];
  correctAction: (id: number) => Promise<{
    ok: boolean;
    error?: string;
    before?: DriveCorrectionSerialized;
    after?: DriveCorrectionSerialized;
    beforeLabels?: import("@/lib/integrity/drives").FkLabels;
    afterLabels?: import("@/lib/integrity/drives").FkLabels;
    positionCount?: number;
    absorbedPositionIds?: number[];
    absorbedCount?: number;
  }>;
  applyCorrectAction: (
    id: number,
    after: DriveCorrectionSerialized,
    absorbedPositionIds: number[],
  ) => Promise<{ ok: boolean; error?: string }>;
  readOnly: boolean;
  saveAction: (
    prev: DriveActionState | null,
    formData: FormData,
  ) => Promise<DriveActionState>;
  deleteAction: () => Promise<{ ok: boolean; error?: string }>;
  positionsTab: ReactNode;
}) {
  const t = useTranslations("drives");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [state, formAction, pending] = useActionState<DriveActionState | null, FormData>(
    saveAction,
    null,
  );

  const lastOkRef = useRef<DriveActionState | null>(null);
  useEffect(() => {
    if (state?.ok && state !== lastOkRef.current) {
      lastOkRef.current = state;
      toast.success(tCommon("saved"));
    }
  }, [state, tCommon]);

  const rawFe = (state?.fieldErrors ?? {}) as Record<string, string>;
  const knownErrors = new Set([
    "endBeforeStart",
    "carRequired",
    "invalidNumber",
  ]);
  const fe: Record<string, string> = Object.fromEntries(
    Object.entries(rawFe).map(([k, v]) => [
      k,
      knownErrors.has(v) ? t(`errors.${v}`) : v,
    ]),
  );

  async function handleDelete() {
    const r = await deleteAction();
    if (r.ok) {
      toast.success(tCommon("deleted"));
      router.push("/drives");
    } else {
      toast.error(r.error ?? tCommon("errorOccurred"));
    }
  }

  return (
    <div className="space-y-4">
      {readOnly ? (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
          {tCommon("readOnlyMode")}
        </div>
      ) : null}

      {state?.error ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      {anomalyReasons.length > 0 ? (
        <div className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          ⚠ {t("correction.banner")} :{" "}
          {anomalyReasons.map((r) => t(`correction.reasonsShort.${r}`)).join(", ")}
        </div>
      ) : null}

      <Tabs defaultValue="drive" className="w-full">
        <TabsList>
          <TabsTrigger value="drive">{t("tabs.drive")}</TabsTrigger>
          <TabsTrigger value="positions">{t("tabs.positions")}</TabsTrigger>
        </TabsList>

        <TabsContent value="drive" className="pt-4">
          <form
            action={formAction}
            id={DRIVE_FORM_ID}
            className="space-y-4"
            data-drive-id={id}
          >
            <DriveForm
              initial={initial}
              fieldErrors={fe}
              readOnly={readOnly}
              mode="edit"
              efficiency={efficiency}
              locationPanel={
                <DriveLocationPanel
                  formId={DRIVE_FORM_ID}
                  initial={{
                    start_km: initial.start_km,
                    end_km: initial.end_km,
                    distance: initial.distance,
                  }}
                  startAddress={initialOptions.startAddress}
                  endAddress={initialOptions.endAddress}
                  startGeofence={initialOptions.startGeofence}
                  endGeofence={initialOptions.endGeofence}
                  track={track}
                  fieldErrors={fe}
                  readOnly={readOnly}
                />
              }
            />
            {/* Barre d'actions flottante : toujours visible même sans scroller. */}
            <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pending || readOnly}>
                  {pending ? tCommon("saving") : t("actions.save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/drives")}
                  disabled={pending}
                >
                  {tCommon("cancel")}
                </Button>
                <DriveCorrectionDialog
                  driveId={id}
                  reasons={anomalyReasons}
                  computeAction={correctAction}
                  applyAction={applyCorrectAction}
                />
              </div>
              <ConfirmDialog
                destructive
                title={t("delete.title")}
                description={t("delete.description")}
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
            </div>
          </form>
        </TabsContent>

        <TabsContent value="positions" className="pt-4">
          {positionsTab}
        </TabsContent>
      </Tabs>
    </div>
  );
}
