"use client";

import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { DateTimeInput } from "@/components/form/datetime-input";
import { FKCombobox, type FKOption } from "@/components/form/fk-combobox";
import { searchAddressesAction } from "@/app/actions/search-addresses";
import { searchGeofencesAction } from "@/app/actions/search-geofences";

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
}: {
  initial: DriveFormValues;
  initialOptions: DriveFormInitialOptions;
  fieldErrors?: Record<string, string | undefined>;
  readOnly?: boolean;
  mode: "create" | "edit";
}) {
  const t = useTranslations("drives");
  const fe = fieldErrors;

  return (
    <div className="space-y-8">
      {/* car_id est imposé par le sélecteur de véhicule du header. On le rend
         hidden + un libellé statique pour rappel. */}
      <input type="hidden" name="car_id" value={initial.car_id} />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.time")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("fields.carId")} : <span className="font-medium text-foreground">{initialOptions.car.label}</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
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
          <FormField id="end_date" label={t("fields.endDate")} error={fe.end_date}>
            <DateTimeInput
              id="end_date"
              name="end_date"
              defaultValue={initial.end_date || null}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            id="duration_min"
            label={t("fields.durationMin")}
            error={fe.duration_min}
          >
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
        <h2 className="text-base font-semibold">{t("sections.distance")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="start_km" label={t("fields.startKm")} error={fe.start_km}>
            <NumberInput
              id="start_km"
              name="start_km"
              defaultValue={initial.start_km}
              step="0.001"
              min={0}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="end_km" label={t("fields.endKm")} error={fe.end_km}>
            <NumberInput
              id="end_km"
              name="end_km"
              defaultValue={initial.end_km}
              step="0.001"
              min={0}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="distance" label={t("fields.distance")} error={fe.distance}>
            <NumberInput
              id="distance"
              name="distance"
              defaultValue={initial.distance}
              step="0.001"
              min={0}
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
              defaultValue={initial.start_ideal_range_km}
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
              defaultValue={initial.end_ideal_range_km}
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
              defaultValue={initial.start_rated_range_km}
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
              defaultValue={initial.end_rated_range_km}
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
          <FormField
            id="start_address_id"
            label={t("fields.startAddress")}
            error={fe.start_address_id}
          >
            <FKCombobox
              id="start_address_id"
              name="start_address_id"
              initial={initialOptions.startAddress}
              searchAction={searchAddressesAction}
              disabled={readOnly}
              allowClear
            />
          </FormField>
          <FormField
            id="end_address_id"
            label={t("fields.endAddress")}
            error={fe.end_address_id}
          >
            <FKCombobox
              id="end_address_id"
              name="end_address_id"
              initial={initialOptions.endAddress}
              searchAction={searchAddressesAction}
              disabled={readOnly}
              allowClear
            />
          </FormField>
          <FormField
            id="start_geofence_id"
            label={t("fields.startGeofence")}
            error={fe.start_geofence_id}
          >
            <FKCombobox
              id="start_geofence_id"
              name="start_geofence_id"
              initial={initialOptions.startGeofence}
              searchAction={searchGeofencesAction}
              disabled={readOnly}
              allowClear
            />
          </FormField>
          <FormField
            id="end_geofence_id"
            label={t("fields.endGeofence")}
            error={fe.end_geofence_id}
          >
            <FKCombobox
              id="end_geofence_id"
              name="end_geofence_id"
              initial={initialOptions.endGeofence}
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
    </div>
  );
}
