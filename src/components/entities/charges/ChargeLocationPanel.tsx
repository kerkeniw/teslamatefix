"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { Separator } from "@/components/ui/separator";
import { FKCombobox, type FKOption } from "@/components/form/fk-combobox";
import { searchAddressesAction } from "@/app/actions/search-addresses";
import { searchGeofencesAction } from "@/app/actions/search-geofences";
import { cn } from "@/lib/utils";

const LeafletMap = dynamic(() => import("./LeafletMap").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] w-full animate-pulse rounded-lg bg-muted" />
  ),
});

type Position = {
  id: number;
  lat: number;
  lng: number;
  odometer: number | null;
};

type Props = {
  position: Position | null;
  outsideTempInitial: string;
  ticksCount: number;
  formId: string;
  addressOption: FKOption | null;
  geofenceOption: FKOption | null;
  readOnly: boolean;
};

export function ChargeLocationPanel({
  position,
  outsideTempInitial,
  ticksCount,
  formId,
  addressOption,
  geofenceOption,
  readOnly,
}: Props) {
  const t = useTranslations("charges");
  const format = useFormatter();

  const [outsideTemp, setOutsideTemp] = useState(outsideTempInitial);

  // Même règle métier que les champs charger (cf. ChargeProcessForm.tsx :
  // verrouillée cochée si exactement 2 ticks, verrouillée décochée si > 2).
  const applyAllLocked = ticksCount > 2;
  const [applyAll, setApplyAll] = useState<boolean>(ticksCount === 2);
  const applyAllTooltip = applyAllLocked
    ? t("hints.applyAllDisabled", { count: ticksCount })
    : undefined;

  const odometerLabel = useMemo(() => {
    if (!position || position.odometer == null) return "—";
    return `${format.number(position.odometer, { maximumFractionDigits: 0 })} km`;
  }, [position, format]);

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        {position ? (
          <LeafletMap lat={position.lat} lng={position.lng} />
        ) : (
          <div className="flex h-[280px] items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            {t("hints.noPosition")}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField id="odometer_display" label={t("fields.odometer")}>
            <p
              id="odometer_display"
              className="font-mono text-sm tabular-nums"
              aria-live="polite"
            >
              {odometerLabel}
            </p>
          </FormField>
          <FormField id="outside_temp_avg" label={t("fields.outsideTempAvg")}>
            <NumberInput
              id="outside_temp_avg"
              name="outside_temp_avg"
              value={outsideTemp}
              onChange={(e) => setOutsideTemp((e.target as HTMLInputElement).value)}
              step="0.1"
              disabled={readOnly}
              form={formId}
            />
          </FormField>
        </div>

        <input
          type="hidden"
          name="outside_temp_avg_initial"
          value={outsideTempInitial}
          form={formId}
        />
        <input
          type="hidden"
          name="outside_temp_avg_apply_all"
          value={applyAll ? "true" : "false"}
          form={formId}
        />

        <label
          className={cn(
            "flex items-center gap-1.5 text-[11px] text-muted-foreground",
            applyAllLocked && "opacity-50",
          )}
          title={applyAllTooltip}
        >
          <input
            type="checkbox"
            checked={applyAll}
            onChange={(e) => setApplyAll(e.target.checked)}
            className="size-3.5 rounded border-input"
            disabled={readOnly || applyAllLocked}
          />
          {t("hints.applyToAllTicks")}
        </label>

        <Separator />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t("sections.location")}</h3>
          <FormField id="address_id" label={t("fields.addressId")}>
            <FKCombobox
              id="address_id"
              name="address_id"
              initial={addressOption}
              searchAction={searchAddressesAction}
              disabled={readOnly}
              allowClear
              form={formId}
            />
          </FormField>
          <FormField id="geofence_id" label={t("fields.geofenceId")}>
            <FKCombobox
              id="geofence_id"
              name="geofence_id"
              initial={geofenceOption}
              searchAction={searchGeofencesAction}
              disabled={readOnly}
              allowClear
              form={formId}
            />
          </FormField>
        </div>
      </CardContent>
    </Card>
  );
}
