"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { DateTimeInput } from "@/components/form/datetime-input";
import { type FKOption } from "@/components/form/fk-combobox";

export type DriveFormValues = {
  car_id: string;
  start_date: string;
  end_date: string;
  start_km: string;
  end_km: string;
  distance: string;
  duration_min: string;
  start_address_id: string;
  end_address_id: string;
  start_geofence_id: string;
  end_geofence_id: string;
  start_ideal_range_km: string;
  end_ideal_range_km: string;
  start_rated_range_km: string;
  end_rated_range_km: string;
  outside_temp_avg: string;
  inside_temp_avg: string;
  speed_max: string;
  power_min: string;
  power_max: string;
  ascent: string;
  descent: string;
};

export type DriveFormInitialOptions = {
  car: FKOption;
  startAddress: FKOption | null;
  endAddress: FKOption | null;
  startGeofence: FKOption | null;
  endGeofence: FKOption | null;
};

export function DriveForm({
  initial,
  initialOptions,
  fieldErrors = {},
  readOnly = false,
  efficiency = null,
  locationPanel,
}: {
  initial: DriveFormValues;
  initialOptions: DriveFormInitialOptions;
  fieldErrors?: Record<string, string | undefined>;
  readOnly?: boolean;
  mode: "create" | "edit";
  /** kWh/km (cars.efficiency) pour l'estimation d'énergie consommée. */
  efficiency?: number | null;
  /** Colonne de droite (carte + localisation + odomètre). */
  locationPanel?: ReactNode;
}) {
  const t = useTranslations("drives");
  const fe = fieldErrors;

  // Champs d'autonomie pilotés pour recalculer l'énergie consommée en live.
  const [startRated, setStartRated] = useState(initial.start_rated_range_km);
  const [endRated, setEndRated] = useState(initial.end_rated_range_km);
  const [startIdeal, setStartIdeal] = useState(initial.start_ideal_range_km);
  const [endIdeal, setEndIdeal] = useState(initial.end_ideal_range_km);

  const energyUsedKwh = useMemo(() => {
    if (efficiency == null || efficiency <= 0) return null;
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    let deltaKm: number | null = null;
    const sr = num(startRated);
    const er = num(endRated);
    if (sr != null && er != null && Number.isFinite(sr) && Number.isFinite(er)) {
      deltaKm = sr - er;
    } else {
      const si = num(startIdeal);
      const ei = num(endIdeal);
      if (si != null && ei != null && Number.isFinite(si) && Number.isFinite(ei)) {
        deltaKm = si - ei;
      }
    }
    if (deltaKm == null) return null;
    return Math.max(0, deltaKm) * efficiency;
  }, [efficiency, startRated, endRated, startIdeal, endIdeal]);

  const sections = (
    <div className="space-y-8 lg:col-span-1">
      {/* car_id est imposé par le sélecteur de véhicule du header. */}
      <input type="hidden" name="car_id" value={initial.car_id} />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.time")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("fields.carId")} :{" "}
          <span className="font-medium text-foreground">{initialOptions.car.label}</span>
        </p>
        <div className="space-y-4">
          <FormField id="start_date" label={t("fields.startDate")} required error={fe.start_date}>
            <DateTimeInput
              id="start_date"
              name="start_date"
              defaultValue={initial.start_date || null}
              required
              disabled={readOnly}
            />
          </FormField>
          <FormField id="end_date" label={t("fields.endDate")} error={fe.end_date}>
            <DateTimeInput
              id="end_date"
              name="end_date"
              defaultValue={initial.end_date || null}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="duration_min" label={t("fields.durationMin")} error={fe.duration_min}>
            <NumberInput
              id="duration_min"
              name="duration_min"
              defaultValue={initial.duration_min}
              step="1"
              min={0}
              max={32767}
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.energy")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="start_ideal_range_km"
            label={t("fields.startIdealRangeKm")}
            error={fe.start_ideal_range_km}
          >
            <NumberInput
              id="start_ideal_range_km"
              name="start_ideal_range_km"
              value={startIdeal}
              onChange={(e) => setStartIdeal((e.target as HTMLInputElement).value)}
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
              value={endIdeal}
              onChange={(e) => setEndIdeal((e.target as HTMLInputElement).value)}
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
              value={startRated}
              onChange={(e) => setStartRated((e.target as HTMLInputElement).value)}
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
              value={endRated}
              onChange={(e) => setEndRated((e.target as HTMLInputElement).value)}
              step="0.01"
              disabled={readOnly}
            />
          </FormField>
        </div>
        <FormField id="energy_used_estimate" label={t("fields.energyUsedEstimate")}>
          <p
            id="energy_used_estimate"
            className="font-mono text-sm tabular-nums"
            aria-live="polite"
          >
            {energyUsedKwh == null
              ? "—"
              : `${energyUsedKwh.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh`}
          </p>
        </FormField>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.performance")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="speed_max" label={t("fields.speedMax")} error={fe.speed_max}>
            <NumberInput
              id="speed_max"
              name="speed_max"
              defaultValue={initial.speed_max}
              step="1"
              min={0}
              max={32767}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="power_max" label={t("fields.powerMax")} error={fe.power_max}>
            <NumberInput
              id="power_max"
              name="power_max"
              defaultValue={initial.power_max}
              step="1"
              min={-32768}
              max={32767}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="power_min" label={t("fields.powerMin")} error={fe.power_min}>
            <NumberInput
              id="power_min"
              name="power_min"
              defaultValue={initial.power_min}
              step="1"
              min={-32768}
              max={32767}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="ascent" label={t("fields.ascent")} error={fe.ascent}>
            <NumberInput
              id="ascent"
              name="ascent"
              defaultValue={initial.ascent}
              step="1"
              disabled={readOnly}
            />
          </FormField>
          <FormField id="descent" label={t("fields.descent")} error={fe.descent}>
            <NumberInput
              id="descent"
              name="descent"
              defaultValue={initial.descent}
              step="1"
              disabled={readOnly}
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
          <FormField
            id="inside_temp_avg"
            label={t("fields.insideTempAvg")}
            error={fe.inside_temp_avg}
          >
            <NumberInput
              id="inside_temp_avg"
              name="inside_temp_avg"
              defaultValue={initial.inside_temp_avg}
              step="0.1"
              disabled={readOnly}
            />
          </FormField>
        </div>
      </section>
    </div>
  );

  if (!locationPanel) return sections;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {sections}
      {locationPanel}
    </div>
  );
}
