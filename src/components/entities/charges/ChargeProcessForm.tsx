"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { DateTimeInput } from "@/components/form/datetime-input";
import { FKCombobox, type FKOption } from "@/components/form/fk-combobox";
import { searchAddressesAction } from "@/app/actions/search-addresses";
import { searchGeofencesAction } from "@/app/actions/search-geofences";
import { searchPositionsAction } from "@/app/actions/search-positions";
import { deriveChargeEndsAction } from "@/app/actions/derive-charge-ends";

function computeDurationMin(startDate: string, endDate: string): number | null {
  if (!startDate || !endDate) return null;
  const s = new Date(startDate).getTime();
  const e = new Date(endDate).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.round((e - s) / 60000);
}

export type ChargeProcessFormValues = {
  car_id: string;
  position_id: string;
  start_date: string;
  end_date: string;
  charge_energy_added: string;
  charge_energy_used: string;
  cost: string;
  start_battery_level: string;
  end_battery_level: string;
  start_ideal_range_km: string;
  end_ideal_range_km: string;
  start_rated_range_km: string;
  end_rated_range_km: string;
  address_id: string;
  geofence_id: string;
  outside_temp_avg: string;
};

export type ChargeProcessFormInitialOptions = {
  car: FKOption;
  position: FKOption | null;
  address: FKOption | null;
  geofence: FKOption | null;
};

export function ChargeProcessForm({
  initial,
  initialOptions,
  fieldErrors = {},
  readOnly = false,
}: {
  initial: ChargeProcessFormValues;
  initialOptions: ChargeProcessFormInitialOptions;
  fieldErrors?: Record<string, string | undefined>;
  readOnly?: boolean;
  mode: "create" | "edit";
}) {
  const t = useTranslations("charges");
  const fe = fieldErrors;

  const [startDate, setStartDate] = useState(initial.start_date);
  const [endDate, setEndDate] = useState(initial.end_date);
  const duration = useMemo(
    () => computeDurationMin(startDate, endDate),
    [startDate, endDate],
  );

  const [chargeEnergyAdded, setChargeEnergyAdded] = useState(initial.charge_energy_added);
  const [startBatteryLevel, setStartBatteryLevel] = useState(initial.start_battery_level);
  const [endBatteryLevel, setEndBatteryLevel] = useState(initial.end_battery_level);
  const [startIdealRangeKm, setStartIdealRangeKm] = useState(initial.start_ideal_range_km);
  const [endIdealRangeKm, setEndIdealRangeKm] = useState(initial.end_ideal_range_km);
  const [startRatedRangeKm, setStartRatedRangeKm] = useState(initial.start_rated_range_km);
  const [endRatedRangeKm, setEndRatedRangeKm] = useState(initial.end_rated_range_km);

  const [deriving, startDerive] = useTransition();

  function parseNumberOrNull(s: string): number | null {
    if (!s || s.trim() === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function handleEstimate() {
    const energy = parseNumberOrNull(chargeEnergyAdded);
    if (energy == null || energy <= 0) {
      toast.error(t("estimateToast.missingEnergy"));
      return;
    }
    startDerive(async () => {
      const res = await deriveChargeEndsAction({
        car_id: initialOptions.car.id,
        start_battery_level: parseNumberOrNull(startBatteryLevel),
        start_ideal_range_km: parseNumberOrNull(startIdealRangeKm),
        start_rated_range_km: parseNumberOrNull(startRatedRangeKm),
        charge_energy_added: energy,
      });
      if (!res.ok || !res.derived) {
        toast.error(res.error ?? t("estimateToast.failed"));
        return;
      }
      const d = res.derived;
      let applied = 0;
      if (d.end_battery_level != null) {
        setEndBatteryLevel(String(d.end_battery_level));
        applied++;
      }
      if (d.end_ideal_range_km != null) {
        setEndIdealRangeKm(String(d.end_ideal_range_km));
        applied++;
      }
      if (d.end_rated_range_km != null) {
        setEndRatedRangeKm(String(d.end_rated_range_km));
        applied++;
      }
      if (applied === 0) {
        toast.warning(t("estimateToast.partial"));
      } else if (applied < 3) {
        toast.warning(t("estimateToast.partial"));
      } else {
        toast.success(t("estimateToast.success"));
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* car_id imposé par le sélecteur véhicule du header. */}
      <input type="hidden" name="car_id" value={initial.car_id} />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.time")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("fields.carId")} : <span className="font-medium text-foreground">{initialOptions.car.label}</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="position_id"
            label={t("fields.positionId")}
            required
            error={fe.position_id}
          >
            <FKCombobox
              id="position_id"
              name="position_id"
              initial={initialOptions.position}
              searchAction={searchPositionsAction}
              disabled={readOnly}
              required
            />
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
              value={startDate || ""}
              onChange={(e) => setStartDate((e.target as HTMLInputElement).value)}
              required
              disabled={readOnly}
            />
          </FormField>
          <FormField id="end_date" label={t("fields.endDate")} error={fe.end_date}>
            <DateTimeInput
              id="end_date"
              name="end_date"
              value={endDate || ""}
              onChange={(e) => setEndDate((e.target as HTMLInputElement).value)}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="duration_min_display"
            label={t("fields.durationMinComputed")}
          >
            <p
              id="duration_min_display"
              className="text-sm text-muted-foreground"
              aria-live="polite"
            >
              {duration == null ? "—" : duration}
            </p>
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.energy")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="charge_energy_added"
            label={t("fields.chargeEnergyAdded")}
            error={fe.charge_energy_added}
          >
            <NumberInput
              id="charge_energy_added"
              name="charge_energy_added"
              value={chargeEnergyAdded}
              onChange={(e) => setChargeEnergyAdded((e.target as HTMLInputElement).value)}
              step="0.01"
              min={0}
              max={999999.99}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="charge_energy_used"
            label={t("fields.chargeEnergyUsed")}
            error={fe.charge_energy_used}
          >
            <NumberInput
              id="charge_energy_used"
              name="charge_energy_used"
              defaultValue={initial.charge_energy_used}
              step="0.01"
              min={0}
              max={999999.99}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="cost" label={t("fields.cost")} error={fe.cost}>
            <NumberInput
              id="cost"
              name="cost"
              defaultValue={initial.cost}
              step="0.01"
              min={0}
              max={9999.99}
              disabled={readOnly}
            />
          </FormField>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEstimate}
            disabled={readOnly || deriving}
          >
            {deriving ? t("estimateToast.estimating") : t("actions.estimateEndValues")}
          </Button>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.battery")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="start_battery_level"
            label={t("fields.startBatteryLevel")}
            error={fe.start_battery_level}
          >
            <NumberInput
              id="start_battery_level"
              name="start_battery_level"
              value={startBatteryLevel}
              onChange={(e) => setStartBatteryLevel((e.target as HTMLInputElement).value)}
              step="1"
              min={0}
              max={100}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="end_battery_level"
            label={t("fields.endBatteryLevel")}
            error={fe.end_battery_level}
          >
            <NumberInput
              id="end_battery_level"
              name="end_battery_level"
              value={endBatteryLevel}
              onChange={(e) => setEndBatteryLevel((e.target as HTMLInputElement).value)}
              step="1"
              min={0}
              max={100}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="start_ideal_range_km"
            label={t("fields.startIdealRangeKm")}
            error={fe.start_ideal_range_km}
          >
            <NumberInput
              id="start_ideal_range_km"
              name="start_ideal_range_km"
              value={startIdealRangeKm}
              onChange={(e) => setStartIdealRangeKm((e.target as HTMLInputElement).value)}
              step="0.01"
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="end_ideal_range_km"
            label={t("fields.endIdealRangeKm")}
            error={fe.end_ideal_range_km}
          >
            <NumberInput
              id="end_ideal_range_km"
              name="end_ideal_range_km"
              value={endIdealRangeKm}
              onChange={(e) => setEndIdealRangeKm((e.target as HTMLInputElement).value)}
              step="0.01"
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="start_rated_range_km"
            label={t("fields.startRatedRangeKm")}
            error={fe.start_rated_range_km}
          >
            <NumberInput
              id="start_rated_range_km"
              name="start_rated_range_km"
              value={startRatedRangeKm}
              onChange={(e) => setStartRatedRangeKm((e.target as HTMLInputElement).value)}
              step="0.01"
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="end_rated_range_km"
            label={t("fields.endRatedRangeKm")}
            error={fe.end_rated_range_km}
          >
            <NumberInput
              id="end_rated_range_km"
              name="end_rated_range_km"
              value={endRatedRangeKm}
              onChange={(e) => setEndRatedRangeKm((e.target as HTMLInputElement).value)}
              step="0.01"
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.location")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="address_id" label={t("fields.addressId")} error={fe.address_id}>
            <FKCombobox
              id="address_id"
              name="address_id"
              initial={initialOptions.address}
              searchAction={searchAddressesAction}
              disabled={readOnly}
              allowClear
            />
          </FormField>
          <FormField id="geofence_id" label={t("fields.geofenceId")} error={fe.geofence_id}>
            <FKCombobox
              id="geofence_id"
              name="geofence_id"
              initial={initialOptions.geofence}
              searchAction={searchGeofencesAction}
              disabled={readOnly}
              allowClear
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.weather")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="outside_temp_avg"
            label={t("fields.outsideTempAvg")}
            error={fe.outside_temp_avg}
          >
            <NumberInput
              id="outside_temp_avg"
              name="outside_temp_avg"
              defaultValue={initial.outside_temp_avg}
              step="0.1"
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>
    </div>
  );
}
