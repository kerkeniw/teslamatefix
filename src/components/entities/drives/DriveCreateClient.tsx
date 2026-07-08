"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { DateTimeInput } from "@/components/form/datetime-input";
import { AddressGeoCombobox } from "@/components/form/address-geo-combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DriveActionState } from "./DriveTabs";
import {
  computeDriveAction,
  createDriveWithPositionsAction,
  type ComputedDrive,
  type ComputeStartState,
} from "@/app/[locale]/drives/actions";
import { findGeofenceForPointAction } from "@/app/actions/find-geofence";
import type { FKOption } from "@/components/form/fk-combobox";
import { useRouter } from "@/i18n/navigation";
import { Calculator, MapPin } from "lucide-react";

type Coord = { lat: number; lon: number };

const PREVIEW_ROWS = 50;

export function DriveCreateClient({
  carId,
  carLabel,
  hasCar,
  readOnly,
}: {
  carId: number | null;
  carLabel: string;
  hasCar: boolean;
  readOnly: boolean;
}) {
  const t = useTranslations("drives");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [startDate, setStartDate] = useState("");
  const [fromCoord, setFromCoord] = useState<Coord | null>(null);
  const [toCoord, setToCoord] = useState<Coord | null>(null);
  const [startGeofence, setStartGeofence] = useState<FKOption | null>(null);
  const [endGeofence, setEndGeofence] = useState<FKOption | null>(null);

  const [needsStartState, setNeedsStartState] = useState(false);
  const [ss, setSs] = useState({
    odometerKm: "",
    batteryLevel: "",
    idealRangeKm: "",
    ratedRangeKm: "",
    outsideTemp: "",
    insideTemp: "",
  });

  const [computed, setComputed] = useState<ComputedDrive | null>(null);
  const [computing, startComputing] = useTransition();

  const [state, formAction, pending] = useActionState<DriveActionState | null, FormData>(
    createDriveWithPositionsAction,
    null,
  );

  // Toute modification des entrées invalide le calcul précédent.
  function invalidate() {
    setComputed(null);
  }

  async function onFromSelected(lat: number, lon: number) {
    setFromCoord({ lat, lon });
    invalidate();
    setStartGeofence(await findGeofenceForPointAction(lat, lon));
  }
  async function onToSelected(lat: number, lon: number) {
    setToCoord({ lat, lon });
    invalidate();
    setEndGeofence(await findGeofenceForPointAction(lat, lon));
  }

  function num(v: string): number | null {
    const s = v.trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function buildOverride(): ComputeStartState | null {
    const odo = num(ss.odometerKm);
    if (odo == null) return null; // odomètre obligatoire
    return {
      odometerKm: odo,
      batteryLevel: num(ss.batteryLevel),
      idealRangeKm: num(ss.idealRangeKm),
      ratedRangeKm: num(ss.ratedRangeKm),
      outsideTemp: num(ss.outsideTemp),
      insideTemp: num(ss.insideTemp),
    };
  }

  const canCompute =
    carId != null && !!fromCoord && !!toCoord && startDate.trim() !== "" && !computing;

  function handleCompute() {
    if (!canCompute || !fromCoord || !toCoord || carId == null) return;
    const override = needsStartState ? buildOverride() : null;
    if (needsStartState && !override) {
      toast.error(t("startState.odometerRequired"));
      return;
    }
    startComputing(async () => {
      const res = await computeDriveAction({
        carId,
        startDate,
        from: fromCoord,
        to: toCoord,
        startStateOverride: override,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.needsStartState) {
        setNeedsStartState(true);
        toast.info(t("startState.needed"));
        return;
      }
      setNeedsStartState(false);
      setComputed(res.computed);
    });
  }

  // Toast d'erreur serveur (state.ok === false) comme sur l'écran d'édition.
  const lastErrRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state?.ok === false && state.error && state.error !== lastErrRef.current) {
      lastErrRef.current = state.error;
      toast.error(state.error);
    }
  }, [state]);

  const d = computed?.drive;
  const previewPositions = computed?.positions.slice(0, PREVIEW_ROWS) ?? [];
  const numberFmt = (n: number | null, digits = 2) =>
    n == null ? "—" : n.toFixed(digits);

  return (
    <form action={formAction} className="space-y-8">
      {readOnly ? (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
          {tCommon("readOnlyMode")}
        </div>
      ) : null}
      {!hasCar ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {t("errors.noCar")}
        </div>
      ) : null}

      {/* Champs cachés postés à la sauvegarde */}
      <input type="hidden" name="car_id" value={carId != null ? String(carId) : ""} />
      <input type="hidden" name="start_geofence_id" value={startGeofence ? String(startGeofence.id) : ""} />
      <input type="hidden" name="end_geofence_id" value={endGeofence ? String(endGeofence.id) : ""} />
      <input type="hidden" name="payload" value={computed ? JSON.stringify(computed) : ""} />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.itinerary")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("fields.carId")} : <span className="font-medium text-foreground">{carLabel}</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="start_address_id" label={t("fields.startAddress")} required>
            <AddressGeoCombobox
              id="start_address_id"
              name="start_address_id"
              required
              disabled={readOnly}
              onAddressSelected={onFromSelected}
              onCleared={() => {
                setFromCoord(null);
                setStartGeofence(null);
                invalidate();
              }}
            />
            {startGeofence ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" aria-hidden />
                {t("fields.startGeofence")} : {startGeofence.label}
              </p>
            ) : null}
          </FormField>

          <FormField id="end_address_id" label={t("fields.endAddress")} required>
            <AddressGeoCombobox
              id="end_address_id"
              name="end_address_id"
              required
              disabled={readOnly}
              onAddressSelected={onToSelected}
              onCleared={() => {
                setToCoord(null);
                setEndGeofence(null);
                invalidate();
              }}
            />
            {endGeofence ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" aria-hidden />
                {t("fields.endGeofence")} : {endGeofence.label}
              </p>
            ) : null}
          </FormField>

          <FormField id="start_date" label={t("fields.startDate")} required>
            <DateTimeInput
              id="start_date"
              name="start_date"
              value={startDate}
              onChange={(e) => {
                setStartDate((e.target as HTMLInputElement).value);
                invalidate();
              }}
              required
              disabled={readOnly}
            />
          </FormField>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCompute}
            disabled={!canCompute || readOnly}
          >
            <Calculator className="size-4" aria-hidden />
            {computing ? t("compute.running") : t("compute.action")}
          </Button>
          {!canCompute && !computed ? (
            <span className="text-xs text-muted-foreground">{t("compute.hint")}</span>
          ) : null}
        </div>
      </section>

      {needsStartState ? (
        <>
          <Separator />
          <section className="space-y-4">
            <h2 className="text-base font-semibold">{t("startState.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("startState.description")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="ss_odometer" label={t("startState.odometer")} required>
                <NumberInput
                  id="ss_odometer"
                  value={ss.odometerKm}
                  onChange={(e) => setSs({ ...ss, odometerKm: (e.target as HTMLInputElement).value })}
                  step="0.001"
                  min={0}
                  disabled={readOnly}
                />
              </FormField>
              <FormField id="ss_battery" label={t("startState.batteryLevel")}>
                <NumberInput
                  id="ss_battery"
                  value={ss.batteryLevel}
                  onChange={(e) => setSs({ ...ss, batteryLevel: (e.target as HTMLInputElement).value })}
                  step="1"
                  min={0}
                  max={100}
                  disabled={readOnly}
                />
              </FormField>
              <FormField id="ss_ideal" label={t("startState.idealRange")}>
                <NumberInput
                  id="ss_ideal"
                  value={ss.idealRangeKm}
                  onChange={(e) => setSs({ ...ss, idealRangeKm: (e.target as HTMLInputElement).value })}
                  step="0.01"
                  min={0}
                  disabled={readOnly}
                />
              </FormField>
              <FormField id="ss_rated" label={t("startState.ratedRange")}>
                <NumberInput
                  id="ss_rated"
                  value={ss.ratedRangeKm}
                  onChange={(e) => setSs({ ...ss, ratedRangeKm: (e.target as HTMLInputElement).value })}
                  step="0.01"
                  min={0}
                  disabled={readOnly}
                />
              </FormField>
              <FormField id="ss_outside" label={t("startState.outsideTemp")}>
                <NumberInput
                  id="ss_outside"
                  value={ss.outsideTemp}
                  onChange={(e) => setSs({ ...ss, outsideTemp: (e.target as HTMLInputElement).value })}
                  step="0.1"
                  disabled={readOnly}
                />
              </FormField>
              <FormField id="ss_inside" label={t("startState.insideTemp")}>
                <NumberInput
                  id="ss_inside"
                  value={ss.insideTemp}
                  onChange={(e) => setSs({ ...ss, insideTemp: (e.target as HTMLInputElement).value })}
                  step="0.1"
                  disabled={readOnly}
                />
              </FormField>
            </div>
          </section>
        </>
      ) : null}

      {d ? (
        <>
          <Separator />
          <section className="space-y-4">
            <h2 className="text-base font-semibold">{t("compute.resultTitle")}</h2>
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">{t("fields.distance")}</span>
                <div className="font-medium">{numberFmt(d.distance, 2)} km</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t("fields.durationMin")}</span>
                <div className="font-medium">{d.duration_min} min</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t("fields.speedMax")}</span>
                <div className="font-medium">{d.speed_max ?? "—"} km/h</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t("fields.startKm")}</span>
                <div className="font-medium">{numberFmt(d.start_km, 1)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t("fields.endKm")}</span>
                <div className="font-medium">{numberFmt(d.end_km, 1)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t("fields.endRatedRangeKm")}</span>
                <div className="font-medium">{numberFmt(d.end_rated_range_km)}</div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                {t("positionsPreview.count", { count: computed!.positions.length })}
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("positionsPreview.date")}</TableHead>
                      <TableHead className="text-right">{t("positionsPreview.odometer")}</TableHead>
                      <TableHead className="text-right">{t("positionsPreview.speed")}</TableHead>
                      <TableHead className="text-right">{t("positionsPreview.battery")}</TableHead>
                      <TableHead className="text-right">{t("positionsPreview.ratedRange")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewPositions.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">
                          {new Date(p.date).toISOString().slice(0, 19).replace("T", " ")}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{p.odometer.toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{p.speed ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{p.battery_level ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{p.rated_battery_range_km ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {computed!.positions.length > PREVIEW_ROWS ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("positionsPreview.truncated", { shown: PREVIEW_ROWS })}
                </p>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      <Separator />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || readOnly || !hasCar || !computed}>
          {pending ? tCommon("saving") : t("actions.create")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/drives")} disabled={pending}>
          {tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}
