"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useRouter } from "@/i18n/navigation";

export type StateFormValues = {
  state: "online" | "offline" | "asleep" | "";
  start_date: string;
  end_date: string;
  car_id: string;
  close_previous: boolean;
};

export type StateFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof StateFormValues, string>>;
};

export type CarOption = { id: number; label: string };

export type StateFormProps = {
  mode: "create" | "edit";
  initial: StateFormValues;
  cars: CarOption[];
  /** Map car_id -> id de l'état actuellement ouvert (sans end_date). */
  openStates?: Record<number, number>;
  /** Pour le mode edit : id courant à exclure de la détection d'ouverture. */
  currentStateId?: number;
  id?: number;
  readOnly?: boolean;
  saveAction: (
    prev: StateFormState | null,
    formData: FormData,
  ) => Promise<StateFormState>;
  deleteAction?: () => Promise<{ ok: boolean; error?: string }>;
};

export function StateForm({
  mode,
  initial,
  cars,
  openStates = {},
  currentStateId,
  id,
  readOnly = false,
  saveAction,
  deleteAction,
}: StateFormProps) {
  const t = useTranslations("states");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [stateValue, setStateValue] = useState<string>(initial.state);
  const [carId, setCarId] = useState(initial.car_id);
  const [endDate, setEndDate] = useState(initial.end_date);
  const [closePrevious, setClosePrevious] = useState(initial.close_previous);

  const [actionState, formAction, pending] = useActionState<StateFormState | null, FormData>(
    saveAction,
    null,
  );

  async function handleDelete() {
    if (!deleteAction) return;
    const result = await deleteAction();
    if (result.ok) {
      toast.success(tCommon("deleted"));
      router.push("/states");
    } else {
      toast.error(result.error ?? tCommon("errorOccurred"));
    }
  }

  const rawFe = actionState?.fieldErrors ?? {};
  // Les actions serveur renvoient des clés i18n (ex. "openStateExists") plutôt
  // que des messages localisés. On résout ici, côté client, dans la locale active.
  function tErr(key: string | undefined): string | undefined {
    if (!key) return undefined;
    const known = new Set([
      "endBeforeStart",
      "openStateExists",
      "carRequired",
      "stateRequired",
      "noCar",
    ]);
    if (known.has(key)) return t(`errors.${key}`);
    return key;
  }
  const fe: Record<string, string | undefined> = {
    state: tErr(rawFe.state),
    start_date: tErr(rawFe.start_date),
    end_date: tErr(rawFe.end_date),
    car_id: tErr(rawFe.car_id),
  };
  const noCars = cars.length === 0;

  // Détection d'un état ouvert pour cette voiture (hors état courant en édition).
  const carIdNum = carId ? parseInt(carId, 10) : NaN;
  const conflictingOpenId =
    Number.isFinite(carIdNum) && openStates[carIdNum] && openStates[carIdNum] !== currentStateId
      ? openStates[carIdNum]
      : null;
  const wouldBeOpen = endDate.trim() === "";
  const showClosePreviousOption = wouldBeOpen && conflictingOpenId !== null;

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

      {actionState?.error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {actionState.error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="state" label={t("fields.state")} required error={fe.state}>
          <input type="hidden" name="state" value={stateValue} />
          <Select
            value={stateValue}
            onValueChange={(v) => setStateValue(typeof v === "string" ? v : "")}
            disabled={readOnly}
          >
            <SelectTrigger id="state" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="online">{t("values.online")}</SelectItem>
              <SelectItem value="asleep">{t("values.asleep")}</SelectItem>
              <SelectItem value="offline">{t("values.offline")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

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

        <FormField id="start_date" label={t("fields.startDate")} required error={fe.start_date}>
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
            value={endDate}
            onChange={(e) => setEndDate((e.target as HTMLInputElement).value)}
            disabled={readOnly}
          />
        </FormField>
      </div>

      {showClosePreviousOption ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              name="close_previous"
              value="1"
              checked={closePrevious}
              onChange={(e) => setClosePrevious(e.target.checked)}
              className="mt-0.5 size-4 cursor-pointer accent-tesla-red"
              disabled={readOnly}
            />
            <span>
              <span className="block font-medium text-amber-900 dark:text-amber-200">
                {t("closePrevious.label")}
              </span>
              <span className="mt-0.5 block text-xs text-amber-900/80 dark:text-amber-200/80">
                {t("closePrevious.description")}
              </span>
            </span>
          </label>
        </div>
      ) : null}

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
            onClick={() => router.push("/states")}
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
