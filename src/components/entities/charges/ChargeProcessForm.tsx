"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/form/form-field";
import { NumberInput } from "@/components/form/number-input";
import { FKCombobox, type FKOption } from "@/components/form/fk-combobox";
import { FieldWithTickHint } from "./FieldWithTickHint";
import { ChargerTickField } from "./ChargerTickField";
import type {
  ChargerTicksContext,
  ChargerTickField as ChargerTickFieldName,
  TickFieldSuggestionsByType,
} from "@/lib/integrity/charges";
import {
  AC_POWERS_KW,
  DC_POWERS_KW,
  DEFAULT_POWER_KW,
  deriveChargerSpecs,
} from "@/lib/integrity/charger-specs";
import { searchAddressesAction } from "@/app/actions/search-addresses";
import { searchGeofencesAction } from "@/app/actions/search-geofences";
import { searchPositionsAction } from "@/app/actions/search-positions";
import { deriveChargeEndsAction } from "@/app/actions/derive-charge-ends";
import { computeDurationMin } from "@/lib/format/duration";

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

/**
 * Données dérivées des ticks (charges) d'une session, sérialisées pour le
 * client. Sert à :
 * - afficher pour chaque champ start/end la valeur lue dans le premier /
 *   dernier tick (avec mise en évidence si différent) ;
 * - alimenter le Select AC/DC + badge "incohérent" en cas de mix ;
 * - borner les dates start/end par le second / avant-dernier tick.
 */
export type ChargeProcessTickContext = {
  firstTick: ChargeProcessTickSnapshot | null;
  lastTick: ChargeProcessTickSnapshot | null;
  chargerType: "AC" | "DC" | "unknown" | "mixed";
  initialChargerType: "AC" | "DC" | "";
  ticksCount: number;
  secondTickDate: string | null;
  penultimateTickDate: string | null;
  chargerTicks: ChargerTicksContext;
  tickFieldSuggestions: TickFieldSuggestionsByType;
};

export type ChargeProcessTickSnapshot = {
  date: string;
  battery_level: number | null;
  charge_energy_added: string;
  ideal_battery_range_km: string | null;
  rated_battery_range_km: string | null;
};


export function ChargeProcessForm({
  initial,
  initialOptions,
  tickContext,
  fieldErrors = {},
  readOnly = false,
  onClientValidityChange,
}: {
  initial: ChargeProcessFormValues;
  initialOptions: ChargeProcessFormInitialOptions;
  tickContext?: ChargeProcessTickContext;
  fieldErrors?: Record<string, string | undefined>;
  readOnly?: boolean;
  mode: "create" | "edit";
  onClientValidityChange?: (valid: boolean) => void;
}) {
  const t = useTranslations("charges");
  const format = useFormatter();
  const formatLocalDateTime = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return format.dateTime(d, "short");
    },
    [format],
  );
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

  const initialChargerType = tickContext?.initialChargerType ?? "";
  const [chargerType, setChargerType] = useState<"AC" | "DC" | "">(initialChargerType);

  // -------------------------------------------------------------------------
  // État hissé des 10 champs borne (anciennement enterrés dans ChargerTickField).
  // Permet aux boutons "Appliquer les valeurs par défaut" et "Annuler" de
  // manipuler tous les champs en bloc. Initialisé depuis les valeurs du dernier
  // tick (sérialisées), figé dans une ref pour le reset.
  // -------------------------------------------------------------------------
  type ChargerFieldsState = Record<ChargerTickFieldName, string>;
  type ChargerApplyAllState = Record<ChargerTickFieldName, boolean>;

  const initialChargerFields = useMemo<ChargerFieldsState>(() => {
    const v = tickContext?.chargerTicks.lastTickValues;
    return {
      charger_voltage: v?.charger_voltage != null ? String(v.charger_voltage) : "",
      charger_phases: v?.charger_phases != null ? String(v.charger_phases) : "",
      charger_actual_current: v?.charger_actual_current != null ? String(v.charger_actual_current) : "",
      charger_pilot_current: v?.charger_pilot_current != null ? String(v.charger_pilot_current) : "",
      charger_power: v?.charger_power != null ? String(v.charger_power) : "",
      conn_charge_cable: v?.conn_charge_cable ?? "",
      fast_charger_brand: v?.fast_charger_brand ?? "",
      fast_charger_type: v?.fast_charger_type ?? "",
      battery_heater_on: v?.battery_heater_on === true ? "true" : "false",
      battery_heater: v?.battery_heater === true ? "true" : "false",
    };
  }, [tickContext]);

  const emptyApplyAll: ChargerApplyAllState = useMemo(
    () => ({
      charger_voltage: false,
      charger_phases: false,
      charger_actual_current: false,
      charger_pilot_current: false,
      charger_power: false,
      conn_charge_cable: false,
      fast_charger_brand: false,
      fast_charger_type: false,
      battery_heater_on: false,
      battery_heater: false,
    }),
    [],
  );

  const [chargerFields, setChargerFields] = useState<ChargerFieldsState>(initialChargerFields);
  const [chargerApplyAll, setChargerApplyAll] = useState<ChargerApplyAllState>(emptyApplyAll);

  // Select kW de la ligne de commandes. Initialisé sur la valeur courante du
  // dernier tick si présente, sinon sur DEFAULT_POWER_KW du type courant.
  const computeInitialPowerKw = (): string => {
    const lastPower = tickContext?.chargerTicks.lastTickValues.charger_power;
    if (lastPower != null) return String(lastPower);
    const t = initialChargerType || "AC";
    return String(DEFAULT_POWER_KW[t as "AC" | "DC"]);
  };
  const [chargerPowerKw, setChargerPowerKw] = useState<string>(computeInitialPowerKw);

  // Snapshots figés pour le bouton Annuler — capturés au premier rendu.
  const initialChargerFieldsRef = useRef<ChargerFieldsState>(initialChargerFields);
  const initialChargerPowerKwRef = useRef<string>(chargerPowerKw);

  function handleChargerFieldChange(field: ChargerTickFieldName, value: string) {
    setChargerFields((s) => ({ ...s, [field]: value }));
  }
  function handleChargerApplyAllChange(field: ChargerTickFieldName, value: boolean) {
    setChargerApplyAll((s) => ({ ...s, [field]: value }));
  }

  function handleChargerTypeChange(next: "AC" | "DC" | "") {
    setChargerType(next);
    // Au switch effectif AC↔DC, reset du Select kW sur le défaut du nouveau
    // type. Si l'utilisateur revient à "" (cas mixed sans choix), on garde la
    // valeur courante du Select.
    if (next === "AC" || next === "DC") {
      setChargerPowerKw(String(DEFAULT_POWER_KW[next]));
    }
  }

  function handleApplyChargerDefaults() {
    if (chargerType !== "AC" && chargerType !== "DC") return;
    const kw = Number(chargerPowerKw);
    if (!Number.isFinite(kw)) return;
    const specs = deriveChargerSpecs(chargerType, kw);
    setChargerFields({
      charger_voltage: specs.voltage != null ? String(specs.voltage) : "",
      charger_phases: specs.phases != null ? String(specs.phases) : "",
      charger_actual_current: specs.current != null ? String(specs.current) : "",
      charger_pilot_current: specs.pilot_current != null ? String(specs.pilot_current) : "",
      charger_power: String(kw),
      conn_charge_cable: specs.conn_charge_cable,
      fast_charger_brand: specs.fast_charger_brand,
      fast_charger_type: specs.fast_charger_type,
      battery_heater_on: specs.battery_heater_on ? "true" : "false",
      battery_heater: specs.battery_heater ? "true" : "false",
    });
    // Décision utilisateur : on ne touche pas aux checkboxes apply_all.
  }

  function handleResetChargerSection() {
    setChargerFields(initialChargerFieldsRef.current);
    setChargerApplyAll(emptyApplyAll);
    setChargerPowerKw(initialChargerPowerKwRef.current);
    setChargerType(initialChargerType);
  }

  const powerKwOptions =
    chargerType === "DC" ? DC_POWERS_KW : AC_POWERS_KW;

  const textSuggestions = useMemo(() => {
    const key: "AC" | "DC" = chargerType === "DC" ? "DC" : "AC";
    return tickContext?.tickFieldSuggestions[key] ?? {
      conn_charge_cable: [],
      fast_charger_brand: [],
      fast_charger_type: [],
    };
  }, [chargerType, tickContext]);

  const [deriving, startDerive] = useTransition();

  // ---- Validation live des bornes de date contre les ticks intermédiaires.
  const secondTickDate = tickContext?.secondTickDate ?? null;
  const penultimateTickDate = tickContext?.penultimateTickDate ?? null;

  const startBoundError = useMemo<string | null>(() => {
    if (!secondTickDate || !startDate) return null;
    return new Date(startDate).getTime() >= new Date(secondTickDate).getTime()
      ? t("errors.startAfterSecondTick", { tick: formatLocalDateTime(secondTickDate) })
      : null;
  }, [startDate, secondTickDate, t, formatLocalDateTime]);

  const endBoundError = useMemo<string | null>(() => {
    if (!penultimateTickDate || !endDate) return null;
    return new Date(endDate).getTime() <= new Date(penultimateTickDate).getTime()
      ? t("errors.endBeforeOrEqualPenultimateTick", {
          tick: formatLocalDateTime(penultimateTickDate),
        })
      : null;
  }, [endDate, penultimateTickDate, t, formatLocalDateTime]);

  useEffect(() => {
    if (!onClientValidityChange) return;
    onClientValidityChange(!startBoundError && !endBoundError);
  }, [startBoundError, endBoundError, onClientValidityChange]);

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

  const firstTick = tickContext?.firstTick ?? null;
  const lastTick = tickContext?.lastTick ?? null;
  const chargerTypeChanged =
    chargerType !== "" && chargerType !== initialChargerType;

  return (
    <div className="space-y-8">
      {/* car_id imposé par le sélecteur véhicule du header. */}
      <input type="hidden" name="car_id" value={initial.car_id} />
      <input type="hidden" name="charger_type_initial" value={initialChargerType} />

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
          <FieldWithTickHint
            kind="datetime"
            id="start_date"
            name="start_date"
            label={t("fields.startDate")}
            value={startDate}
            onChange={setStartDate}
            tickValue={firstTick?.date ?? null}
            formatTick={formatLocalDateTime}
            tolerance={1000}
            required
            disabled={readOnly}
            error={startBoundError ?? fe.start_date ?? null}
          />
          <FieldWithTickHint
            kind="datetime"
            id="end_date"
            name="end_date"
            label={t("fields.endDate")}
            value={endDate}
            onChange={setEndDate}
            tickValue={lastTick?.date ?? null}
            formatTick={formatLocalDateTime}
            tolerance={1000}
            disabled={readOnly}
            error={endBoundError ?? fe.end_date ?? null}
          />
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

      {tickContext ? (
        <>
          <Separator />
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold">{t("sections.charger")}</h2>
              {tickContext.chargerType === "mixed" ? (
                <Badge variant="outline" className="border-warn/50 bg-warn/10 text-warn">
                  {t("type.mixed")}
                </Badge>
              ) : null}
            </div>
            {tickContext.chargerType === "mixed" ? (
              <p className="text-xs text-warn">{t("warnings.chargerTypeMixed")}</p>
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <FormField
                id="charger_type"
                label={t("fields.chargerType")}
                error={fe.charger_type}
                hint={
                  chargerTypeChanged
                    ? t("hints.chargerTypeChangeWillUpdateTicks", { n: tickContext.ticksCount })
                    : undefined
                }
                className="min-w-[12rem] flex-1"
              >
                <Select
                  value={chargerType}
                  onValueChange={(v) => handleChargerTypeChange((v as "AC" | "DC") ?? "")}
                  disabled={readOnly}
                >
                  <SelectTrigger id="charger_type" className="w-full">
                    <SelectValue placeholder={t("type.unknown")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AC">{t("type.ac")}</SelectItem>
                    <SelectItem value="DC">{t("type.dc")}</SelectItem>
                  </SelectContent>
                </Select>
                <input type="hidden" name="charger_type" value={chargerType} />
              </FormField>
              <FormField
                id="charger_power_kw"
                label={t("fields.chargerPowerKw")}
                className="min-w-[10rem] flex-1"
              >
                <Select
                  value={chargerPowerKw}
                  onValueChange={(v) =>
                    setChargerPowerKw(typeof v === "string" ? v : String(v ?? ""))
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger id="charger_power_kw" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {powerKwOptions.map((p) => (
                      <SelectItem key={p} value={String(p)}>
                        {p} kW
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <div className="flex gap-2 pb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleApplyChargerDefaults}
                  disabled={readOnly || (chargerType !== "AC" && chargerType !== "DC")}
                >
                  {t("actions.applyChargerDefaults")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetChargerSection}
                  disabled={readOnly}
                >
                  {t("actions.cancelChargerChanges")}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <ChargerTickField
                id="charger_voltage"
                name="charger_voltage"
                label={t("fields.chargerVoltage")}
                kind="int"
                step="1"
                min={0}
                max={1000}
                value={chargerFields.charger_voltage}
                onChange={(v) => handleChargerFieldChange("charger_voltage", v)}
                applyAll={chargerApplyAll.charger_voltage}
                onApplyAllChange={(v) => handleChargerApplyAllChange("charger_voltage", v)}
                initialValue={initialChargerFields.charger_voltage}
                stats={tickContext.chargerTicks.stats.charger_voltage}
                disabled={readOnly}
                error={fe.charger_voltage ?? null}
              />
              <ChargerTickField
                id="charger_phases"
                name="charger_phases"
                label={t("fields.chargerPhases")}
                kind="int"
                step="1"
                min={0}
                max={3}
                value={chargerFields.charger_phases}
                onChange={(v) => handleChargerFieldChange("charger_phases", v)}
                applyAll={chargerApplyAll.charger_phases}
                onApplyAllChange={(v) => handleChargerApplyAllChange("charger_phases", v)}
                initialValue={initialChargerFields.charger_phases}
                stats={tickContext.chargerTicks.stats.charger_phases}
                disabled={readOnly}
                error={fe.charger_phases ?? null}
              />
              <ChargerTickField
                id="charger_actual_current"
                name="charger_actual_current"
                label={t("fields.chargerCurrent")}
                kind="int"
                step="1"
                min={0}
                max={1000}
                value={chargerFields.charger_actual_current}
                onChange={(v) => handleChargerFieldChange("charger_actual_current", v)}
                applyAll={chargerApplyAll.charger_actual_current}
                onApplyAllChange={(v) => handleChargerApplyAllChange("charger_actual_current", v)}
                initialValue={initialChargerFields.charger_actual_current}
                stats={tickContext.chargerTicks.stats.charger_actual_current}
                disabled={readOnly}
                error={fe.charger_actual_current ?? null}
              />
              <ChargerTickField
                id="charger_pilot_current"
                name="charger_pilot_current"
                label={t("fields.chargerPilotCurrent")}
                kind="int"
                step="1"
                min={0}
                max={1000}
                value={chargerFields.charger_pilot_current}
                onChange={(v) => handleChargerFieldChange("charger_pilot_current", v)}
                applyAll={chargerApplyAll.charger_pilot_current}
                onApplyAllChange={(v) => handleChargerApplyAllChange("charger_pilot_current", v)}
                initialValue={initialChargerFields.charger_pilot_current}
                stats={tickContext.chargerTicks.stats.charger_pilot_current}
                disabled={readOnly}
                error={fe.charger_pilot_current ?? null}
              />
              <ChargerTickField
                id="charger_power"
                name="charger_power"
                label={t("fields.chargerPower")}
                kind="int"
                step="1"
                min={0}
                value={chargerFields.charger_power}
                onChange={(v) => handleChargerFieldChange("charger_power", v)}
                applyAll={chargerApplyAll.charger_power}
                onApplyAllChange={(v) => handleChargerApplyAllChange("charger_power", v)}
                initialValue={initialChargerFields.charger_power}
                stats={tickContext.chargerTicks.stats.charger_power}
                disabled={readOnly}
                error={fe.charger_power ?? null}
              />
              <ChargerTickField
                id="conn_charge_cable"
                name="conn_charge_cable"
                label={t("fields.connChargeCable")}
                kind="text"
                value={chargerFields.conn_charge_cable}
                onChange={(v) => handleChargerFieldChange("conn_charge_cable", v)}
                applyAll={chargerApplyAll.conn_charge_cable}
                onApplyAllChange={(v) => handleChargerApplyAllChange("conn_charge_cable", v)}
                initialValue={initialChargerFields.conn_charge_cable}
                stats={tickContext.chargerTicks.stats.conn_charge_cable}
                suggestions={textSuggestions.conn_charge_cable}
                disabled={readOnly}
                error={fe.conn_charge_cable ?? null}
              />
              <ChargerTickField
                id="fast_charger_brand"
                name="fast_charger_brand"
                label={t("fields.fastChargerBrand")}
                kind="text"
                value={chargerFields.fast_charger_brand}
                onChange={(v) => handleChargerFieldChange("fast_charger_brand", v)}
                applyAll={chargerApplyAll.fast_charger_brand}
                onApplyAllChange={(v) => handleChargerApplyAllChange("fast_charger_brand", v)}
                initialValue={initialChargerFields.fast_charger_brand}
                stats={tickContext.chargerTicks.stats.fast_charger_brand}
                suggestions={textSuggestions.fast_charger_brand}
                disabled={readOnly}
                error={fe.fast_charger_brand ?? null}
              />
              <ChargerTickField
                id="fast_charger_type"
                name="fast_charger_type"
                label={t("fields.fastChargerType")}
                kind="text"
                value={chargerFields.fast_charger_type}
                onChange={(v) => handleChargerFieldChange("fast_charger_type", v)}
                applyAll={chargerApplyAll.fast_charger_type}
                onApplyAllChange={(v) => handleChargerApplyAllChange("fast_charger_type", v)}
                initialValue={initialChargerFields.fast_charger_type}
                stats={tickContext.chargerTicks.stats.fast_charger_type}
                suggestions={textSuggestions.fast_charger_type}
                disabled={readOnly}
                error={fe.fast_charger_type ?? null}
              />
              <ChargerTickField
                id="battery_heater_on"
                name="battery_heater_on"
                label={t("fields.batteryHeaterOn")}
                kind="bool"
                value={chargerFields.battery_heater_on}
                onChange={(v) => handleChargerFieldChange("battery_heater_on", v)}
                applyAll={chargerApplyAll.battery_heater_on}
                onApplyAllChange={(v) => handleChargerApplyAllChange("battery_heater_on", v)}
                initialValue={initialChargerFields.battery_heater_on}
                stats={tickContext.chargerTicks.stats.battery_heater_on}
                disabled={readOnly}
                error={fe.battery_heater_on ?? null}
              />
              <ChargerTickField
                id="battery_heater"
                name="battery_heater"
                label={t("fields.batteryHeater")}
                kind="bool"
                value={chargerFields.battery_heater}
                onChange={(v) => handleChargerFieldChange("battery_heater", v)}
                applyAll={chargerApplyAll.battery_heater}
                onApplyAllChange={(v) => handleChargerApplyAllChange("battery_heater", v)}
                initialValue={initialChargerFields.battery_heater}
                stats={tickContext.chargerTicks.stats.battery_heater}
                disabled={readOnly}
                error={fe.battery_heater ?? null}
              />
            </div>
          </section>
        </>
      ) : null}

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.energy")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWithTickHint
            kind="number"
            id="charge_energy_added"
            name="charge_energy_added"
            label={t("fields.chargeEnergyAdded")}
            value={chargeEnergyAdded}
            onChange={setChargeEnergyAdded}
            tickValue={lastTick?.charge_energy_added ?? null}
            tolerance={0.01}
            step="0.01"
            min={0}
            max={999999.99}
            disabled={readOnly}
            error={fe.charge_energy_added ?? null}
          />
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
          <FieldWithTickHint
            kind="number"
            id="start_battery_level"
            name="start_battery_level"
            label={t("fields.startBatteryLevel")}
            value={startBatteryLevel}
            onChange={setStartBatteryLevel}
            tickValue={firstTick?.battery_level != null ? String(firstTick.battery_level) : null}
            tolerance={0}
            step="1"
            min={0}
            max={100}
            disabled={readOnly}
            error={fe.start_battery_level ?? null}
          />
          <FieldWithTickHint
            kind="number"
            id="end_battery_level"
            name="end_battery_level"
            label={t("fields.endBatteryLevel")}
            value={endBatteryLevel}
            onChange={setEndBatteryLevel}
            tickValue={lastTick?.battery_level != null ? String(lastTick.battery_level) : null}
            tolerance={0}
            step="1"
            min={0}
            max={100}
            disabled={readOnly}
            error={fe.end_battery_level ?? null}
          />
          <FieldWithTickHint
            kind="number"
            id="start_ideal_range_km"
            name="start_ideal_range_km"
            label={t("fields.startIdealRangeKm")}
            value={startIdealRangeKm}
            onChange={setStartIdealRangeKm}
            tickValue={firstTick?.ideal_battery_range_km ?? null}
            tolerance={0.01}
            step="0.01"
            disabled={readOnly}
            error={fe.start_ideal_range_km ?? null}
          />
          <FieldWithTickHint
            kind="number"
            id="end_ideal_range_km"
            name="end_ideal_range_km"
            label={t("fields.endIdealRangeKm")}
            value={endIdealRangeKm}
            onChange={setEndIdealRangeKm}
            tickValue={lastTick?.ideal_battery_range_km ?? null}
            tolerance={0.01}
            step="0.01"
            disabled={readOnly}
            error={fe.end_ideal_range_km ?? null}
          />
          <FieldWithTickHint
            kind="number"
            id="start_rated_range_km"
            name="start_rated_range_km"
            label={t("fields.startRatedRangeKm")}
            value={startRatedRangeKm}
            onChange={setStartRatedRangeKm}
            tickValue={firstTick?.rated_battery_range_km ?? null}
            tolerance={0.01}
            step="0.01"
            disabled={readOnly}
            error={fe.start_rated_range_km ?? null}
          />
          <FieldWithTickHint
            kind="number"
            id="end_rated_range_km"
            name="end_rated_range_km"
            label={t("fields.endRatedRangeKm")}
            value={endRatedRangeKm}
            onChange={setEndRatedRangeKm}
            tickValue={lastTick?.rated_battery_range_km ?? null}
            tolerance={0.01}
            step="0.01"
            disabled={readOnly}
            error={fe.end_rated_range_km ?? null}
          />
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
