"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import { NumberInput } from "@/components/form/number-input";
import { DateTimeInput } from "@/components/form/datetime-input";
import { ConfirmDialog } from "@/components/tesla/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { OsmLink } from "./OsmLink";

export type PositionFormValues = {
  car_id: string;
  drive_id: string;
  date: string;
  latitude: string;
  longitude: string;
  speed: string;
  power: string;
  odometer: string;
  elevation: string;
  outside_temp: string;
  inside_temp: string;
  battery_level: string;
  usable_battery_level: string;
  ideal_battery_range_km: string;
  rated_battery_range_km: string;
  est_battery_range_km: string;
  fan_status: string;
  driver_temp_setting: string;
  passenger_temp_setting: string;
  is_climate_on: "true" | "false" | "";
  is_rear_defroster_on: "true" | "false" | "";
  is_front_defroster_on: "true" | "false" | "";
  battery_heater: "true" | "false" | "";
  battery_heater_on: "true" | "false" | "";
  battery_heater_no_power: "true" | "false" | "";
  tpms_pressure_fl: string;
  tpms_pressure_fr: string;
  tpms_pressure_rl: string;
  tpms_pressure_rr: string;
};

export type PositionActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type CarOption = { id: number; label: string };
export type DriveOption = { id: number; label: string };

function BoolSelect({
  id,
  name,
  value,
  onChange,
  disabled,
}: {
  id: string;
  name: string;
  value: "true" | "false" | "";
  onChange: (v: "true" | "false" | "") => void;
  disabled?: boolean;
}) {
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={(v) => onChange((typeof v === "string" ? v : "") as "true" | "false" | "")} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">—</SelectItem>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}

export function PositionForm({
  mode,
  id,
  initial,
  cars,
  drives,
  referencedByCharge = false,
  referencedByDrives = [],
  readOnly = false,
  saveAction,
  deleteAction,
}: {
  mode: "create" | "edit";
  id?: number;
  initial: PositionFormValues;
  cars: CarOption[];
  drives: DriveOption[];
  referencedByCharge?: boolean;
  referencedByDrives?: number[];
  readOnly?: boolean;
  saveAction: (
    prev: PositionActionState | null,
    formData: FormData,
  ) => Promise<PositionActionState>;
  deleteAction?: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const t = useTranslations("positions");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const noCars = cars.length === 0;

  const [carId, setCarId] = useState(initial.car_id);
  const [driveId, setDriveId] = useState(initial.drive_id);
  const [latitude, setLatitude] = useState(initial.latitude);
  const [longitude, setLongitude] = useState(initial.longitude);
  const [climate, setClimate] = useState(initial.is_climate_on);
  const [rearDef, setRearDef] = useState(initial.is_rear_defroster_on);
  const [frontDef, setFrontDef] = useState(initial.is_front_defroster_on);
  const [batteryHeater, setBatteryHeater] = useState(initial.battery_heater);
  const [batteryHeaterOn, setBatteryHeaterOn] = useState(initial.battery_heater_on);
  const [batteryHeaterNoPower, setBatteryHeaterNoPower] = useState(initial.battery_heater_no_power);

  const [state, formAction, pending] = useActionState<PositionActionState | null, FormData>(
    saveAction,
    null,
  );

  const lastOkRef = useRef<PositionActionState | null>(null);
  useEffect(() => {
    if (state?.ok && state !== lastOkRef.current) {
      lastOkRef.current = state;
      toast.success(tCommon("saved"));
    }
  }, [state, tCommon]);

  const rawFe = (state?.fieldErrors ?? {}) as Record<string, string>;
  const knownErrors = new Set(["carRequired", "invalidLat", "invalidLon", "invalidDate"]);
  const fe: Record<string, string> = Object.fromEntries(
    Object.entries(rawFe).map(([k, v]) => [k, knownErrors.has(v) ? t(`errors.${v}`) : v]),
  );

  async function handleDelete() {
    if (!deleteAction) return;
    const r = await deleteAction();
    if (r.ok) {
      toast.success(tCommon("deleted"));
      router.push("/positions");
    } else {
      toast.error(r.error ?? tCommon("errorOccurred"));
    }
  }

  return (
    <form action={formAction} className="space-y-6" data-position-id={id}>
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

      {referencedByCharge ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {t("delete.referencedByCharge")}
        </div>
      ) : null}

      {referencedByDrives.length > 0 ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {referencedByDrives.length} drive(s) référencent cette position (start/end_position_id).
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.core")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="car_id" label={t("fields.carId")} required error={fe.car_id}>
            <input type="hidden" name="car_id" value={carId} />
            <Select
              value={carId}
              onValueChange={(v) => setCarId(typeof v === "string" ? v : "")}
              disabled={readOnly || mode === "edit" || noCars}
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
          <FormField id="drive_id" label={t("fields.driveId")} error={fe.drive_id}>
            <input type="hidden" name="drive_id" value={driveId} />
            <Select
              value={driveId}
              onValueChange={(v) => setDriveId(typeof v === "string" ? v : "")}
              disabled={readOnly}
            >
              <SelectTrigger id="drive_id" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">—</SelectItem>
                {drives.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="date" label={t("fields.date")} required error={fe.date}>
            <DateTimeInput
              id="date"
              name="date"
              defaultValue={initial.date || null}
              required
              disabled={readOnly}
            />
          </FormField>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">OSM</span>
            <div>
              {latitude && longitude ? (
                <OsmLink latitude={latitude} longitude={longitude} />
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          </div>
          <FormField
            id="latitude"
            label={t("fields.latitude")}
            required
            error={fe.latitude}
          >
            <NumberInput
              id="latitude"
              name="latitude"
              value={latitude}
              onChange={(e) => setLatitude((e.target as HTMLInputElement).value)}
              step="0.000001"
              min={-90}
              max={90}
              required
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="longitude"
            label={t("fields.longitude")}
            required
            error={fe.longitude}
          >
            <NumberInput
              id="longitude"
              name="longitude"
              value={longitude}
              onChange={(e) => setLongitude((e.target as HTMLInputElement).value)}
              step="0.000001"
              min={-180}
              max={180}
              required
              disabled={readOnly}
            />
          </FormField>
          <FormField id="speed" label={t("fields.speed")} error={fe.speed}>
            <NumberInput id="speed" name="speed" defaultValue={initial.speed} step="1" disabled={readOnly} />
          </FormField>
          <FormField id="power" label={t("fields.power")} error={fe.power}>
            <NumberInput id="power" name="power" defaultValue={initial.power} step="1" disabled={readOnly} />
          </FormField>
          <FormField id="odometer" label={t("fields.odometer")} error={fe.odometer}>
            <NumberInput
              id="odometer"
              name="odometer"
              defaultValue={initial.odometer}
              step="0.001"
              disabled={readOnly}
            />
          </FormField>
          <FormField id="elevation" label={t("fields.elevation")} error={fe.elevation}>
            <NumberInput
              id="elevation"
              name="elevation"
              defaultValue={initial.elevation}
              step="1"
              disabled={readOnly}
            />
          </FormField>
          <FormField id="outside_temp" label={t("fields.outsideTemp")} error={fe.outside_temp}>
            <NumberInput
              id="outside_temp"
              name="outside_temp"
              defaultValue={initial.outside_temp}
              step="0.1"
              disabled={readOnly}
            />
          </FormField>
          <FormField id="inside_temp" label={t("fields.insideTemp")} error={fe.inside_temp}>
            <NumberInput
              id="inside_temp"
              name="inside_temp"
              defaultValue={initial.inside_temp}
              step="0.1"
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.battery")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="battery_level" label={t("fields.batteryLevel")} error={fe.battery_level}>
            <NumberInput id="battery_level" name="battery_level" defaultValue={initial.battery_level} step="1" min={0} max={100} disabled={readOnly} />
          </FormField>
          <FormField id="usable_battery_level" label={t("fields.usableBatteryLevel")} error={fe.usable_battery_level}>
            <NumberInput id="usable_battery_level" name="usable_battery_level" defaultValue={initial.usable_battery_level} step="1" min={0} max={100} disabled={readOnly} />
          </FormField>
          <FormField id="ideal_battery_range_km" label={t("fields.idealBatteryRangeKm")} error={fe.ideal_battery_range_km}>
            <NumberInput id="ideal_battery_range_km" name="ideal_battery_range_km" defaultValue={initial.ideal_battery_range_km} step="0.01" disabled={readOnly} />
          </FormField>
          <FormField id="rated_battery_range_km" label={t("fields.ratedBatteryRangeKm")} error={fe.rated_battery_range_km}>
            <NumberInput id="rated_battery_range_km" name="rated_battery_range_km" defaultValue={initial.rated_battery_range_km} step="0.01" disabled={readOnly} />
          </FormField>
          <FormField id="est_battery_range_km" label={t("fields.estBatteryRangeKm")} error={fe.est_battery_range_km}>
            <NumberInput id="est_battery_range_km" name="est_battery_range_km" defaultValue={initial.est_battery_range_km} step="0.01" disabled={readOnly} />
          </FormField>
          <FormField id="battery_heater" label={t("fields.batteryHeater")}>
            <BoolSelect id="battery_heater" name="battery_heater" value={batteryHeater} onChange={setBatteryHeater} disabled={readOnly} />
          </FormField>
          <FormField id="battery_heater_on" label={t("fields.batteryHeaterOn")}>
            <BoolSelect id="battery_heater_on" name="battery_heater_on" value={batteryHeaterOn} onChange={setBatteryHeaterOn} disabled={readOnly} />
          </FormField>
          <FormField id="battery_heater_no_power" label={t("fields.batteryHeaterNoPower")}>
            <BoolSelect id="battery_heater_no_power" name="battery_heater_no_power" value={batteryHeaterNoPower} onChange={setBatteryHeaterNoPower} disabled={readOnly} />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.climate")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="fan_status" label={t("fields.fanStatus")} error={fe.fan_status}>
            <NumberInput id="fan_status" name="fan_status" defaultValue={initial.fan_status} step="1" disabled={readOnly} />
          </FormField>
          <FormField id="driver_temp_setting" label={t("fields.driverTempSetting")} error={fe.driver_temp_setting}>
            <NumberInput id="driver_temp_setting" name="driver_temp_setting" defaultValue={initial.driver_temp_setting} step="0.1" disabled={readOnly} />
          </FormField>
          <FormField id="passenger_temp_setting" label={t("fields.passengerTempSetting")} error={fe.passenger_temp_setting}>
            <NumberInput id="passenger_temp_setting" name="passenger_temp_setting" defaultValue={initial.passenger_temp_setting} step="0.1" disabled={readOnly} />
          </FormField>
          <FormField id="is_climate_on" label={t("fields.isClimateOn")}>
            <BoolSelect id="is_climate_on" name="is_climate_on" value={climate} onChange={setClimate} disabled={readOnly} />
          </FormField>
          <FormField id="is_rear_defroster_on" label={t("fields.isRearDefrosterOn")}>
            <BoolSelect id="is_rear_defroster_on" name="is_rear_defroster_on" value={rearDef} onChange={setRearDef} disabled={readOnly} />
          </FormField>
          <FormField id="is_front_defroster_on" label={t("fields.isFrontDefrosterOn")}>
            <BoolSelect id="is_front_defroster_on" name="is_front_defroster_on" value={frontDef} onChange={setFrontDef} disabled={readOnly} />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.tpms")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="tpms_pressure_fl" label={t("fields.tpmsFl")} error={fe.tpms_pressure_fl}>
            <NumberInput id="tpms_pressure_fl" name="tpms_pressure_fl" defaultValue={initial.tpms_pressure_fl} step="0.1" disabled={readOnly} />
          </FormField>
          <FormField id="tpms_pressure_fr" label={t("fields.tpmsFr")} error={fe.tpms_pressure_fr}>
            <NumberInput id="tpms_pressure_fr" name="tpms_pressure_fr" defaultValue={initial.tpms_pressure_fr} step="0.1" disabled={readOnly} />
          </FormField>
          <FormField id="tpms_pressure_rl" label={t("fields.tpmsRl")} error={fe.tpms_pressure_rl}>
            <NumberInput id="tpms_pressure_rl" name="tpms_pressure_rl" defaultValue={initial.tpms_pressure_rl} step="0.1" disabled={readOnly} />
          </FormField>
          <FormField id="tpms_pressure_rr" label={t("fields.tpmsRr")} error={fe.tpms_pressure_rr}>
            <NumberInput id="tpms_pressure_rr" name="tpms_pressure_rr" defaultValue={initial.tpms_pressure_rr} step="0.1" disabled={readOnly} />
          </FormField>
        </div>
      </section>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || readOnly || (noCars && mode === "create")}>
            {pending ? tCommon("saving") : mode === "create" ? t("actions.create") : t("actions.save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/positions")}
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
