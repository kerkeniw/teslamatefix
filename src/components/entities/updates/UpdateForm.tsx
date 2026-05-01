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
import { DateTimeInput } from "@/components/form/datetime-input";
import { ConfirmDialog } from "@/components/tesla/confirm-dialog";
import { FirmwareLink } from "@/components/tesla/firmware-link";
import { useRouter } from "@/i18n/navigation";

export type UpdateFormValues = {
  start_date: string;
  end_date: string;
  version: string;
  car_id: string;
};

export type UpdateFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof UpdateFormValues, string>>;
};

export type CarOption = { id: number; label: string };

export type UpdateFormProps = {
  mode: "create" | "edit";
  initial: UpdateFormValues;
  cars: CarOption[];
  id?: number;
  readOnly?: boolean;
  saveAction: (
    prev: UpdateFormState | null,
    formData: FormData,
  ) => Promise<UpdateFormState>;
  deleteAction?: () => Promise<{ ok: boolean; error?: string }>;
};

export function UpdateForm({
  mode,
  initial,
  cars,
  id,
  readOnly = false,
  saveAction,
  deleteAction,
}: UpdateFormProps) {
  const t = useTranslations("updates");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [carId, setCarId] = useState(initial.car_id);
  const [version, setVersion] = useState(initial.version);

  const [state, formAction, pending] = useActionState<
    UpdateFormState | null,
    FormData
  >(saveAction, null);

  async function handleDelete() {
    if (!deleteAction) return;
    const result = await deleteAction();
    if (result.ok) {
      toast.success(tCommon("deleted"));
      router.push("/updates");
    } else {
      toast.error(result.error ?? tCommon("errorOccurred"));
    }
  }

  const fe = state?.fieldErrors ?? {};
  const noCars = cars.length === 0;

  return (
    <form action={formAction} className="space-y-6">
      {readOnly ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {tCommon("readOnlyMode")}
        </div>
      ) : null}

      {noCars && mode === "create" ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {t("errors.noCar")}
        </div>
      ) : null}

      {state?.error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="car_id" label={t("fields.carId")} required error={fe.car_id}>
          <input type="hidden" name="car_id" value={carId} />
          <Select
            value={carId}
            onValueChange={(v) => setCarId(typeof v === "string" ? v : "")}
            disabled={readOnly || noCars}
          >
            <SelectTrigger id="car_id" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cars.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          id="version"
          label={t("fields.version")}
          hint={t("hints.version")}
          error={fe.version}
        >
          <div className="flex items-center gap-2">
            <Input
              id="version"
              name="version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="2026.8.6"
              maxLength={255}
              disabled={readOnly}
            />
            {version.trim() ? (
              <FirmwareLink version={version.trim()} className="shrink-0 text-xs" />
            ) : null}
          </div>
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
            defaultValue={initial.start_date || null}
            required
            disabled={readOnly}
          />
        </FormField>
        <FormField
          id="end_date"
          label={t("fields.endDate")}
          hint={t("hints.endDate")}
          error={fe.end_date}
        >
          <DateTimeInput
            id="end_date"
            name="end_date"
            defaultValue={initial.end_date || null}
            disabled={readOnly}
          />
        </FormField>
      </div>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || readOnly || (noCars && mode === "create")}>
            {pending
              ? tCommon("saving")
              : mode === "create"
                ? t("actions.create")
                : t("actions.save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/updates")}
            disabled={pending}
          >
            {tCommon("cancel")}
          </Button>
        </div>
        {mode === "edit" && deleteAction && id !== undefined ? (
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
        ) : null}
      </div>
    </form>
  );
}
