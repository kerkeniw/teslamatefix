"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { CarForm, type CarFormValues } from "./CarForm";
import { CarSettingsForm, type CarSettingsValues } from "./CarSettingsForm";
import type { CarActionState } from "@/app/[locale]/cars/actions";
import { useRouter } from "@/i18n/navigation";

export function CarEditClient({
  id,
  carInitial,
  settingsInitial,
  readOnly,
  saveAction,
}: {
  id: number;
  carInitial: CarFormValues;
  settingsInitial: CarSettingsValues;
  readOnly: boolean;
  saveAction: (
    prev: CarActionState | null,
    formData: FormData,
  ) => Promise<CarActionState>;
}) {
  const t = useTranslations("cars");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [state, formAction, pending] = useActionState<CarActionState | null, FormData>(
    saveAction,
    null,
  );

  const lastOkRef = useRef<CarActionState | null>(null);
  useEffect(() => {
    if (state?.ok && state !== lastOkRef.current) {
      lastOkRef.current = state;
      toast.success(tCommon("saved"));
    }
  }, [state, tCommon]);

  const rawFe = (state?.fieldErrors ?? {}) as Record<string, string>;
  // Les actions serveur renvoient des clés i18n (ex. "invalidPriority")
  // pour rester compatibles fr/en. On les résout côté client.
  const knownErrors = new Set(["invalidNumber", "invalidPriority"]);
  const fe: Record<string, string> = Object.fromEntries(
    Object.entries(rawFe).map(([k, v]) => [
      k,
      knownErrors.has(v) ? t(`errors.${v}`) : v,
    ]),
  );

  return (
    <form action={formAction} className="space-y-6" data-car-id={id}>
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

      <Tabs defaultValue="vehicle" className="w-full">
        <TabsList>
          <TabsTrigger value="vehicle">{t("tabs.vehicle")}</TabsTrigger>
          <TabsTrigger value="settings">{t("tabs.settings")}</TabsTrigger>
        </TabsList>
        <TabsContent value="vehicle" className="pt-4">
          <CarForm initial={carInitial} fieldErrors={fe} readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <CarSettingsForm initial={settingsInitial} fieldErrors={fe} readOnly={readOnly} />
        </TabsContent>
      </Tabs>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || readOnly}>
            {pending ? tCommon("saving") : t("actions.save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/cars")}
            disabled={pending}
          >
            {tCommon("cancel")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground sm:max-w-md sm:text-right">
          {t("deleteUnavailable")}
        </p>
      </div>
    </form>
  );
}
