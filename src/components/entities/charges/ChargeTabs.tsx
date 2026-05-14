"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/tesla/confirm-dialog";
import {
  ChargeProcessForm,
  type ChargeProcessFormValues,
  type ChargeProcessFormInitialOptions,
} from "./ChargeProcessForm";
import { useRouter } from "@/i18n/navigation";

export type ChargeActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export function ChargeTabs({
  id,
  initial,
  initialOptions,
  ticksCount,
  readOnly,
  saveAction,
  deleteAction,
  ticksTab,
  recalcTab,
}: {
  id: number;
  initial: ChargeProcessFormValues;
  initialOptions: ChargeProcessFormInitialOptions;
  ticksCount: number;
  readOnly: boolean;
  saveAction: (
    prev: ChargeActionState | null,
    formData: FormData,
  ) => Promise<ChargeActionState>;
  deleteAction: () => Promise<{ ok: boolean; error?: string }>;
  ticksTab: ReactNode;
  recalcTab: ReactNode;
}) {
  const t = useTranslations("charges");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [state, formAction, pending] = useActionState<ChargeActionState | null, FormData>(
    saveAction,
    null,
  );

  const lastOkRef = useRef<ChargeActionState | null>(null);
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
    "positionRequired",
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
      router.push("/charges");
    } else {
      toast.error(r.error ?? tCommon("errorOccurred"));
    }
  }

  return (
    <div className="space-y-6">
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

      <Tabs defaultValue="session" className="w-full">
        <TabsList>
          <TabsTrigger value="session">{t("tabs.session")}</TabsTrigger>
          <TabsTrigger value="ticks">{t("tabs.ticks")}</TabsTrigger>
          <TabsTrigger value="recalc">{t("tabs.recalc")}</TabsTrigger>
        </TabsList>

        <TabsContent value="session" className="pt-4">
          <form action={formAction} className="space-y-6" data-charge-id={id}>
            <ChargeProcessForm
              initial={initial}
              initialOptions={initialOptions}
              fieldErrors={fe}
              readOnly={readOnly}
              mode="edit"
            />
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <Button type="submit" disabled={pending || readOnly}>
                  {pending ? tCommon("saving") : t("actions.save")}
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
              <ConfirmDialog
                destructive
                title={t("delete.title")}
                description={t("delete.description", { n: ticksCount })}
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

        <TabsContent value="ticks" className="pt-4">
          {ticksTab}
        </TabsContent>

        <TabsContent value="recalc" className="pt-4">
          {recalcTab}
        </TabsContent>
      </Tabs>
    </div>
  );
}
