"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { Separator } from "@/components/ui/separator";
import { FKCombobox, type FKOption } from "@/components/form/fk-combobox";
import { searchAddressesAction } from "@/app/actions/search-addresses";
import { searchGeofencesAction } from "@/app/actions/search-geofences";
import { cn } from "@/lib/utils";
import type { TrackPoint, TrackColorMode } from "./DriveTrackMap";

const DriveTrackMap = dynamic(
  () => import("./DriveTrackMap").then((m) => m.DriveTrackMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[360px] w-full animate-pulse rounded-lg bg-muted" />
    ),
  },
);

export type DriveLocationInitial = {
  start_km: string;
  end_km: string;
  distance: string;
};

export function DriveLocationPanel({
  formId,
  initial,
  startAddress,
  endAddress,
  startGeofence,
  endGeofence,
  track,
  fieldErrors = {},
  readOnly = false,
}: {
  formId: string;
  initial: DriveLocationInitial;
  startAddress: FKOption | null;
  endAddress: FKOption | null;
  startGeofence: FKOption | null;
  endGeofence: FKOption | null;
  track: TrackPoint[];
  fieldErrors?: Record<string, string | undefined>;
  readOnly?: boolean;
}) {
  const t = useTranslations("drives");
  const fe = fieldErrors;
  const [mode, setMode] = useState<TrackColorMode>("track");

  const modes: { value: TrackColorMode; label: string }[] = [
    { value: "track", label: t("map.modeTrack") },
    { value: "power", label: t("map.modePower") },
    { value: "speed", label: t("map.modeSpeed") },
  ];

  return (
    <Card size="sm" className="lg:col-span-2">
      <CardContent className="space-y-4">
        {/* Localisation */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t("sections.location")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              id="start_address_id"
              label={t("fields.startAddress")}
              error={fe.start_address_id}
            >
              <FKCombobox
                id="start_address_id"
                name="start_address_id"
                initial={startAddress}
                searchAction={searchAddressesAction}
                disabled={readOnly}
                allowClear
                form={formId}
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
                initial={startGeofence}
                searchAction={searchGeofencesAction}
                disabled={readOnly}
                allowClear
                form={formId}
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
                initial={endAddress}
                searchAction={searchAddressesAction}
                disabled={readOnly}
                allowClear
                form={formId}
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
                initial={endGeofence}
                searchAction={searchGeofencesAction}
                disabled={readOnly}
                allowClear
                form={formId}
              />
            </FormField>
          </div>
        </div>

        <Separator />

        {/* Odomètre */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t("sections.odometer")}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField id="start_km" label={t("fields.startKm")} error={fe.start_km}>
              <NumberInput
                id="start_km"
                name="start_km"
                defaultValue={initial.start_km}
                step="0.001"
                min={0}
                disabled={readOnly}
                form={formId}
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
                form={formId}
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
                form={formId}
              />
            </FormField>
          </div>
        </div>

        <Separator />

        {/* Carte */}
        {track.length > 0 ? (
          <DriveTrackMap
            track={track}
            mode={mode}
            startLabel={t("map.start")}
            endLabel={t("map.end")}
          />
        ) : (
          <div className="flex h-[360px] items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            {t("map.noTrack")}
          </div>
        )}

        {track.length > 0 ? (
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <legend className="sr-only">{t("map.colorBy")}</legend>
            <span className="text-xs font-medium text-muted-foreground">
              {t("map.colorBy")}
            </span>
            {modes.map((m) => (
              <label
                key={m.value}
                className={cn(
                  "flex items-center gap-1.5 text-sm",
                  mode === m.value && "font-medium text-foreground",
                )}
              >
                <input
                  type="radio"
                  name="drive-track-mode"
                  value={m.value}
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                  className="size-3.5"
                />
                {m.label}
              </label>
            ))}
          </fieldset>
        ) : null}
      </CardContent>
    </Card>
  );
}
