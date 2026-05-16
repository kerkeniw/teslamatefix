"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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
import { Input } from "@/components/ui/input";
import { DateTimeInput } from "@/components/form/datetime-input";
import { FKCombobox, type FKOption } from "@/components/form/fk-combobox";
import { searchAddressesAction } from "@/app/actions/search-addresses";
import { searchGeofencesAction } from "@/app/actions/search-geofences";
import {
  prepareChargeContextAction,
  type PositionDto,
  type PrepareChargeContextResult,
} from "@/app/actions/prepare-charge-context";
import { computeDurationMin } from "@/lib/format/duration";
import { useRouter } from "@/i18n/navigation";
import type { ChargeActionState } from "./ChargeTabs";

/**
 * Parse une chaîne décimale saisie par l'utilisateur (virgule OU point comme
 * séparateur). Retourne `NaN` si non parsable. Utilisé par les calculs live
 * (efficacité, coût/kWh) qui consomment les valeurs brutes des
 * `DecimalTextInput`.
 */
function parseDecimalString(s: string): number {
  return Number(s.trim().replace(",", "."));
}

/**
 * Input texte pour saisie décimale (cost, énergies). On évite volontairement
 * `<input type="number">` parce que step="0.01" + locale fr-FR + virgule peut
 * snapper silencieusement la valeur au step le plus proche selon le navigateur,
 * ce qui produit des mutations imprévisibles entre Step1 et Step2. Ici la
 * chaîne brute saisie est stockée telle quelle ; la normalisation virgule →
 * point est faite côté serveur (`normalizeDecimalString`).
 */
function DecimalTextInput({
  id,
  value,
  onChange,
  required,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      pattern="[0-9]*[.,]?[0-9]*"
      value={value}
      onChange={onChange}
      required={required}
      placeholder={placeholder}
    />
  );
}

type ChargerType = "AC" | "DC";

type Step1Values = {
  start_date: string;
  end_date: string;
  charge_energy_added: string;
  charge_energy_used: string;
  cost: string;
  charger_type: ChargerType;
  charger_power_kw: string;
};

const AC_POWERS = ["7", "11", "22"] as const;
const DC_POWERS = ["50", "150", "250", "350"] as const;

function defaultStep1(): Step1Values {
  const now = new Date();
  const iso = now.toISOString();
  return {
    start_date: iso,
    end_date: iso,
    charge_energy_added: "",
    charge_energy_used: "",
    cost: "",
    charger_type: "AC",
    charger_power_kw: "11",
  };
}

export function ChargeCreateWizard({
  car,
  hasCar,
  readOnly,
  createAction,
}: {
  car: FKOption | null;
  hasCar: boolean;
  readOnly: boolean;
  createAction: (
    prev: ChargeActionState | null,
    formData: FormData,
  ) => Promise<ChargeActionState>;
}) {
  const t = useTranslations("charges");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [step1, setStep1] = useState<Step1Values>(defaultStep1);

  if (!hasCar || !car) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      >
        {t("errors.noCar")}
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        {tCommon("readOnlyMode")}
      </div>
    );
  }

  if (step === 1) {
    return (
      <Step1
        car={car}
        initial={step1}
        onValidate={(v) => {
          setStep1(v);
          setStep(2);
        }}
        onCancel={() => router.push("/charges")}
      />
    );
  }
  return (
    <Step2
      car={car}
      step1={step1}
      onBack={() => setStep(1)}
      createAction={createAction}
    />
  );
}

// =====================================================================
// Step 1 — saisie métier + dérivés live
// =====================================================================

function Step1({
  car,
  initial,
  onValidate,
  onCancel,
}: {
  car: FKOption;
  initial: Step1Values;
  onValidate: (v: Step1Values) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("charges");
  const tCommon = useTranslations("common");

  const [values, setValues] = useState<Step1Values>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Step1Values, string>>>({});

  const duration = useMemo(
    () => computeDurationMin(values.start_date, values.end_date),
    [values.start_date, values.end_date],
  );

  const efficiency = useMemo(() => {
    const u = parseDecimalString(values.charge_energy_used);
    const a = parseDecimalString(values.charge_energy_added);
    if (!Number.isFinite(u) || !Number.isFinite(a) || u <= 0 || a <= 0) return null;
    return Math.round((a / u) * 100 * 10) / 10;
  }, [values.charge_energy_added, values.charge_energy_used]);

  const costPerKwh = useMemo(() => {
    const c = parseDecimalString(values.cost);
    const u = parseDecimalString(values.charge_energy_used);
    if (!Number.isFinite(c) || !Number.isFinite(u) || u <= 0 || c <= 0) return null;
    return Math.round((c / u) * 1000) / 1000;
  }, [values.cost, values.charge_energy_used]);

  function update<K extends keyof Step1Values>(key: K, val: Step1Values[K]) {
    setValues((v) => ({ ...v, [key]: val }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function onChargerTypeChange(t: string | null) {
    const next = t === "DC" ? "DC" : "AC";
    const defaultPower = next === "AC" ? "11" : "50";
    setValues((v) => ({
      ...v,
      charger_type: next,
      charger_power_kw: defaultPower,
    }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof Step1Values, string>> = {};
    if (!values.start_date) next.start_date = t("errors.invalidDate");
    if (!values.end_date) next.end_date = t("errors.invalidDate");
    if (
      values.start_date &&
      values.end_date &&
      new Date(values.end_date).getTime() < new Date(values.start_date).getTime()
    ) {
      next.end_date = t("errors.endBeforeStart");
    }
    if (!values.charge_energy_added.trim()) {
      next.charge_energy_added = t("errors.requiredField");
    } else if (parseDecimalString(values.charge_energy_added) < 0) {
      next.charge_energy_added = t("errors.negativeValue");
    }
    if (values.charge_energy_used.trim() && parseDecimalString(values.charge_energy_used) < 0) {
      next.charge_energy_used = t("errors.negativeValue");
    }
    if (values.cost.trim() && parseDecimalString(values.cost) < 0) {
      next.cost = t("errors.negativeValue");
    }
    const allowed = values.charger_type === "AC" ? AC_POWERS : DC_POWERS;
    if (!(allowed as readonly string[]).includes(values.charger_power_kw)) {
      next.charger_power_kw = t("errors.invalidChargerPower");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (validate()) onValidate(values);
  }

  const powers = values.charger_type === "AC" ? AC_POWERS : DC_POWERS;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("create.step1.title")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("fields.carId")} :{" "}
          <span className="font-medium text-foreground">{car.label}</span>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="start_date"
            label={t("fields.startDate")}
            required
            error={errors.start_date}
          >
            <DateTimeInput
              id="start_date"
              value={values.start_date}
              onChange={(e) =>
                update("start_date", (e.target as HTMLInputElement).value)
              }
              required
            />
          </FormField>

          <FormField
            id="end_date"
            label={t("fields.endDate")}
            required
            error={errors.end_date}
          >
            <DateTimeInput
              id="end_date"
              value={values.end_date}
              onChange={(e) =>
                update("end_date", (e.target as HTMLInputElement).value)
              }
              required
            />
          </FormField>

          <FormField
            id="duration_min_computed"
            label={t("fields.durationMinComputed")}
          >
            <p
              id="duration_min_computed"
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
            required
            error={errors.charge_energy_added}
            hint={t("hints.chargeEnergyAdded")}
          >
            <DecimalTextInput
              id="charge_energy_added"
              value={values.charge_energy_added}
              onChange={(e) =>
                update("charge_energy_added", (e.target as HTMLInputElement).value)
              }
              required
            />
          </FormField>

          <FormField
            id="charge_energy_used"
            label={t("fields.chargeEnergyUsed")}
            error={errors.charge_energy_used}
            hint={t("hints.chargeEnergyUsed")}
          >
            <DecimalTextInput
              id="charge_energy_used"
              value={values.charge_energy_used}
              onChange={(e) =>
                update("charge_energy_used", (e.target as HTMLInputElement).value)
              }
            />
          </FormField>

          <FormField id="efficiency_pct" label={t("fields.efficiencyPct")}>
            <p
              id="efficiency_pct"
              className="text-sm text-muted-foreground"
              aria-live="polite"
            >
              {efficiency == null ? "—" : `${efficiency} %`}
            </p>
          </FormField>

          <FormField
            id="cost"
            label={t("fields.cost")}
            error={errors.cost}
          >
            <DecimalTextInput
              id="cost"
              value={values.cost}
              onChange={(e) =>
                update("cost", (e.target as HTMLInputElement).value)
              }
            />
          </FormField>

          <FormField id="cost_per_kwh" label={t("fields.costPerKwh")}>
            <p
              id="cost_per_kwh"
              className="text-sm text-muted-foreground"
              aria-live="polite"
            >
              {costPerKwh == null ? "—" : `${costPerKwh} €/kWh`}
            </p>
          </FormField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("sections.charger")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="charger_type" label={t("fields.chargerType")} required>
            <Select value={values.charger_type} onValueChange={onChargerTypeChange}>
              <SelectTrigger id="charger_type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AC">{t("type.ac")}</SelectItem>
                <SelectItem value="DC">{t("type.dc")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            id="charger_power_kw"
            label={t("fields.chargerPowerKw")}
            required
            error={errors.charger_power_kw}
            hint={`${values.charger_type} ${values.charger_power_kw} kW`}
          >
            <Select
              value={values.charger_power_kw}
              onValueChange={(v) =>
                update(
                  "charger_power_kw",
                  typeof v === "string" ? v : String(v ?? ""),
                )
              }
            >
              <SelectTrigger id="charger_power_kw" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {powers.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p} kW
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </section>

      <Separator />

      <div className="flex flex-wrap gap-2">
        <Button type="submit">{t("create.actions.validateStep1")}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}

// =====================================================================
// Step 2 — vérification, positions éditables, soumission finale
// =====================================================================

const POSITION_FIELDS = [
  "latitude",
  "longitude",
  "odometer",
  "outside_temp",
  "inside_temp",
  "battery_level",
  "usable_battery_level",
  "ideal_battery_range_km",
  "rated_battery_range_km",
] as const;
type PositionField = (typeof POSITION_FIELDS)[number];

type PositionFormState = Record<PositionField, string>;

function positionToFormState(p: PositionDto): PositionFormState {
  const fmt = (v: number | null) => (v == null ? "" : String(v));
  return {
    latitude: fmt(p.latitude),
    longitude: fmt(p.longitude),
    odometer: fmt(p.odometer),
    outside_temp: fmt(p.outside_temp),
    inside_temp: fmt(p.inside_temp),
    battery_level: fmt(p.battery_level),
    usable_battery_level: fmt(p.usable_battery_level),
    ideal_battery_range_km: fmt(p.ideal_battery_range_km),
    rated_battery_range_km: fmt(p.rated_battery_range_km),
  };
}

function Step2({
  car,
  step1,
  onBack,
  createAction,
}: {
  car: FKOption;
  step1: Step1Values;
  onBack: () => void;
  createAction: (
    prev: ChargeActionState | null,
    formData: FormData,
  ) => Promise<ChargeActionState>;
}) {
  const t = useTranslations("charges");
  const tCommon = useTranslations("common");

  const [context, setContext] = useState<PrepareChargeContextResult | null>(null);
  const [loading, startLoading] = useTransition();

  // Snapshots initiaux (immuables après fetch) servant à détecter les diffs.
  const [beforeInitial, setBeforeInitial] = useState<PositionFormState | null>(null);
  const [afterInitial, setAfterInitial] = useState<PositionFormState | null>(null);

  // Valeurs éditables des positions et de la borne.
  const [beforeValues, setBeforeValues] = useState<PositionFormState | null>(null);
  const [afterValues, setAfterValues] = useState<PositionFormState | null>(null);
  const [chargerVoltage, setChargerVoltage] = useState("");
  const [chargerPhases, setChargerPhases] = useState("");
  const [chargerCurrent, setChargerCurrent] = useState("");
  const [chargerPilotCurrent, setChargerPilotCurrent] = useState("");
  const [pilotTouched, setPilotTouched] = useState(false);
  const [fastCharger, setFastCharger] = useState(false);
  const [connChargeCable, setConnChargeCable] = useState("");
  const [fastChargerBrand, setFastChargerBrand] = useState("");
  const [fastChargerType, setFastChargerType] = useState("");
  const [batteryHeaterOn, setBatteryHeaterOn] = useState(false);
  const [batteryHeater, setBatteryHeater] = useState(false);

  const [address, setAddress] = useState<FKOption | null>(null);
  const [geofence, setGeofence] = useState<FKOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    startLoading(async () => {
      const ctx = await prepareChargeContextAction({
        car_id: car.id,
        start_date: step1.start_date,
        end_date: step1.end_date,
        charger_type: step1.charger_type,
        charger_power_kw: Number(step1.charger_power_kw),
      });
      if (cancelled) return;
      setContext(ctx);
      // Itération 3 : initial = snapshot brut DB (NULL conservés en chaîne
      // vide) ; values = snapshot enrichi (avec fallback). Le serveur compare
      // les deux → INSERT nouvelle position si diff (cas du fallback aussi).
      if (ctx.ok && ctx.position_before) {
        const original = ctx.position_before_original ?? ctx.position_before;
        setBeforeInitial(positionToFormState(original));
        setBeforeValues(positionToFormState(ctx.position_before));
      }
      if (ctx.ok && ctx.position_after) {
        const original = ctx.position_after_original ?? ctx.position_after;
        setAfterInitial(positionToFormState(original));
        setAfterValues(positionToFormState(ctx.position_after));
      }
      if (ctx.ok && ctx.derived_charger) {
        const dc = ctx.derived_charger;
        setChargerVoltage(dc.voltage == null ? "" : String(dc.voltage));
        setChargerPhases(dc.phases == null ? "" : String(dc.phases));
        setChargerCurrent(dc.current == null ? "" : String(dc.current));
        setChargerPilotCurrent(
          dc.pilot_current == null ? "" : String(dc.pilot_current),
        );
        setPilotTouched(false);
        setFastCharger(dc.fast_charger_present);
        setConnChargeCable(dc.conn_charge_cable);
        setFastChargerBrand(dc.fast_charger_brand);
        setFastChargerType(dc.fast_charger_type);
        setBatteryHeaterOn(dc.battery_heater_on);
        setBatteryHeater(dc.battery_heater);
      }
      if (ctx.ok && ctx.address) setAddress(ctx.address);
      if (ctx.ok && ctx.geofence) setGeofence(ctx.geofence);
    });
    return () => {
      cancelled = true;
    };
  }, [
    car.id,
    step1.start_date,
    step1.end_date,
    step1.charger_type,
    step1.charger_power_kw,
  ]);

  // Si l'utilisateur n'a pas touché manuellement le pilot_current, il suit
  // automatiquement le charger_actual_current (pattern observé chez TeslaMate).
  useEffect(() => {
    if (!pilotTouched) setChargerPilotCurrent(chargerCurrent);
  }, [chargerCurrent, pilotTouched]);

  const [state, formAction, pending] = useActionState<
    ChargeActionState | null,
    FormData
  >(createAction, null);

  const rawFe = (state?.fieldErrors ?? {}) as Record<string, string>;
  const knownErrors = new Set([
    "carRequired",
    "positionRequired",
    "endBeforeStart",
    "invalidNumber",
    "negativeValue",
    "startDateInFuture",
    "overlapsSession",
    "invalidChargerPower",
  ]);
  const fe: Record<string, string> = Object.fromEntries(
    Object.entries(rawFe).map(([k, v]) => [
      k,
      knownErrors.has(v) ? t(`errors.${v}`) : v,
    ]),
  );

  const duration = computeDurationMin(step1.start_date, step1.end_date);
  const efficiency = (() => {
    const u = parseDecimalString(step1.charge_energy_used);
    const a = parseDecimalString(step1.charge_energy_added);
    if (!Number.isFinite(u) || !Number.isFinite(a) || u <= 0 || a <= 0) return null;
    return Math.round((a / u) * 100 * 10) / 10;
  })();
  const costPerKwh = (() => {
    const c = parseDecimalString(step1.cost);
    const u = parseDecimalString(step1.charge_energy_used);
    if (!Number.isFinite(c) || !Number.isFinite(u) || u <= 0 || c <= 0) return null;
    return Math.round((c / u) * 1000) / 1000;
  })();

  if (loading || !context) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }
  if (!context.ok) {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {context.error ?? t("errors.invalidContext")}
        </div>
        <Button type="button" variant="outline" onClick={onBack}>
          {t("create.actions.backToStep1")}
        </Button>
      </div>
    );
  }
  if (!context.position_before) {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {t("errors.noPositionBefore")}
        </div>
        <Button type="button" variant="outline" onClick={onBack}>
          {t("create.actions.backToStep1")}
        </Button>
      </div>
    );
  }

  const before = context.position_before;
  const after = context.position_after;
  const warning = context.derived_charger?.warning;

  return (
    <form action={formAction} className="space-y-6">
      {state?.error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {state.error}
        </div>
      ) : null}

      {warning === "acLimitedTo11kW" ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {t("create.warnings.acLimitedTo11kW")}
        </div>
      ) : null}

      {/* Hidden : valeurs portées depuis Step1 */}
      <input type="hidden" name="car_id" value={String(car.id)} />
      <input type="hidden" name="start_date" value={step1.start_date} />
      <input type="hidden" name="end_date" value={step1.end_date} />
      <input
        type="hidden"
        name="charge_energy_added"
        value={step1.charge_energy_added}
      />
      <input
        type="hidden"
        name="charge_energy_used"
        value={step1.charge_energy_used}
      />
      <input type="hidden" name="cost" value={step1.cost} />
      <input type="hidden" name="charger_type" value={step1.charger_type} />
      <input
        type="hidden"
        name="charger_power_kw"
        value={step1.charger_power_kw}
      />
      <input
        type="hidden"
        name="charger_power"
        value={step1.charger_power_kw}
      />
      <input
        type="hidden"
        name="fast_charger_present"
        value={fastCharger ? "true" : "false"}
      />

      {/* Récap session */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t("create.step2.title")}</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <RecapItem
            label={t("fields.startDate")}
            value={formatDate(step1.start_date)}
          />
          <RecapItem
            label={t("fields.endDate")}
            value={formatDate(step1.end_date)}
          />
          <RecapItem
            label={t("fields.durationMinComputed")}
            value={duration == null ? "—" : `${duration} min`}
          />
          <RecapItem
            label={t("fields.chargeEnergyAdded")}
            value={
              step1.charge_energy_added.trim() === ""
                ? "—"
                : `${step1.charge_energy_added} kWh`
            }
            emphasis
            note={normalizedNote(step1.charge_energy_added)}
          />
          <RecapItem
            label={t("fields.chargeEnergyUsed")}
            value={
              step1.charge_energy_used.trim() === ""
                ? "—"
                : `${step1.charge_energy_used} kWh`
            }
            emphasis
            note={normalizedNote(step1.charge_energy_used)}
          />
          <RecapItem
            label={t("fields.efficiencyPct")}
            value={efficiency == null ? "—" : `${efficiency} %`}
          />
          <RecapItem
            label={t("fields.cost")}
            value={step1.cost.trim() === "" ? "—" : `${step1.cost} €`}
            emphasis
            note={normalizedNote(step1.cost)}
          />
          <RecapItem
            label={t("fields.costPerKwh")}
            value={costPerKwh == null ? "—" : `${costPerKwh} €/kWh`}
          />
          <RecapItem
            label={t("fields.chargerTypePower")}
            value={`${step1.charger_type} ${step1.charger_power_kw} kW`}
          />
        </dl>
      </section>

      <Separator />

      {/* Position de début */}
      <PositionSection
        title={t("create.positions.before")}
        prefix="position_before"
        position={before}
        initial={beforeInitial}
        values={beforeValues}
        onChange={setBeforeValues}
      />

      <Separator />

      {/* Position de fin */}
      {after && afterInitial && afterValues ? (
        <PositionSection
          title={t("create.positions.after")}
          prefix="position_after"
          position={after}
          initial={afterInitial}
          values={afterValues}
          onChange={setAfterValues}
        />
      ) : (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("create.positions.after")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("create.positions.afterMissing")}
          </p>
        </section>
      )}

      <Separator />

      {/* Borne — V/A/phases éditables */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">{t("sections.charger")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="charger_voltage" label={t("fields.chargerVoltage")}>
            <NumberInput
              id="charger_voltage"
              name="charger_voltage"
              value={chargerVoltage}
              onChange={(e) =>
                setChargerVoltage((e.target as HTMLInputElement).value)
              }
              step="1"
              min={0}
              max={1000}
            />
          </FormField>
          <FormField id="charger_phases" label={t("fields.chargerPhases")}>
            <NumberInput
              id="charger_phases"
              name="charger_phases"
              value={chargerPhases}
              onChange={(e) =>
                setChargerPhases((e.target as HTMLInputElement).value)
              }
              step="1"
              min={0}
              max={3}
            />
          </FormField>
          <FormField id="charger_actual_current" label={t("fields.chargerCurrent")}>
            <NumberInput
              id="charger_actual_current"
              name="charger_actual_current"
              value={chargerCurrent}
              onChange={(e) =>
                setChargerCurrent((e.target as HTMLInputElement).value)
              }
              step="1"
              min={0}
              max={1000}
            />
          </FormField>
          <FormField
            id="charger_pilot_current"
            label={t("fields.chargerPilotCurrent")}
          >
            <NumberInput
              id="charger_pilot_current"
              name="charger_pilot_current"
              value={chargerPilotCurrent}
              onChange={(e) => {
                setPilotTouched(true);
                setChargerPilotCurrent((e.target as HTMLInputElement).value);
              }}
              step="1"
              min={0}
              max={1000}
            />
          </FormField>
          <FormField id="fast_charger_present" label={t("fields.fastChargerPresent")}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fastCharger}
                onChange={(e) => setFastCharger(e.target.checked)}
                className="size-4 rounded border-input"
              />
              {fastCharger ? t("type.dc") : t("type.ac")}
            </label>
          </FormField>
        </div>
      </section>

      <Separator />

      {/* Détails borne — câble, marque, type, chauffage batterie */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">{t("sections.chargerDetails")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="conn_charge_cable" label={t("fields.connChargeCable")}>
            <input
              id="conn_charge_cable"
              name="conn_charge_cable"
              type="text"
              value={connChargeCable}
              onChange={(e) => setConnChargeCable(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            />
          </FormField>
          <FormField id="fast_charger_brand" label={t("fields.fastChargerBrand")}>
            <input
              id="fast_charger_brand"
              name="fast_charger_brand"
              type="text"
              value={fastChargerBrand}
              onChange={(e) => setFastChargerBrand(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            />
          </FormField>
          <FormField id="fast_charger_type" label={t("fields.fastChargerType")}>
            <input
              id="fast_charger_type"
              name="fast_charger_type"
              type="text"
              value={fastChargerType}
              onChange={(e) => setFastChargerType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            />
          </FormField>
          <FormField id="battery_heater_on" label={t("fields.batteryHeaterOn")}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={batteryHeaterOn}
                onChange={(e) => setBatteryHeaterOn(e.target.checked)}
                className="size-4 rounded border-input"
              />
              {batteryHeaterOn ? tCommon("yes") : tCommon("no")}
            </label>
            <input
              type="hidden"
              name="battery_heater_on"
              value={batteryHeaterOn ? "true" : "false"}
            />
          </FormField>
          <FormField id="battery_heater" label={t("fields.batteryHeater")}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={batteryHeater}
                onChange={(e) => setBatteryHeater(e.target.checked)}
                className="size-4 rounded border-input"
              />
              {batteryHeater ? tCommon("yes") : tCommon("no")}
            </label>
            <input
              type="hidden"
              name="battery_heater"
              value={batteryHeater ? "true" : "false"}
            />
          </FormField>
        </div>
      </section>

      <Separator />

      {/* Localisation */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">{t("sections.location")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="address_id" label={t("fields.addressId")} error={fe.address_id}>
            <FKCombobox
              id="address_id"
              name="address_id"
              initial={address}
              searchAction={searchAddressesAction}
              allowClear
            />
          </FormField>
          <FormField id="geofence_id" label={t("fields.geofenceId")} error={fe.geofence_id}>
            <FKCombobox
              id="geofence_id"
              name="geofence_id"
              initial={geofence}
              searchAction={searchGeofencesAction}
              allowClear
            />
          </FormField>
        </div>
      </section>

      <Separator />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : t("create.actions.confirmCreate")}
        </Button>
        <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
          {t("create.actions.backToStep1")}
        </Button>
      </div>
    </form>
  );
}

function RecapItem({
  label,
  value,
  emphasis,
  note,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  note?: string | null;
}) {
  return (
    <>
      <dt className={emphasis ? "font-semibold" : "text-muted-foreground"}>
        {label}
      </dt>
      <dd className={emphasis ? "text-base font-bold" : "font-medium"}>
        {value}
        {note ? (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {note}
          </span>
        ) : null}
      </dd>
    </>
  );
}

/**
 * Affiche la valeur saisie + la valeur effectivement stockée si différente
 * (après normalisation virgule → point). Permet au user de vérifier visuellement
 * qu'aucune mutation silencieuse ne s'est produite.
 */
function normalizedNote(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  if (normalized === raw) return null;
  return `(stocké : ${normalized})`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function PositionSection({
  title,
  prefix,
  position,
  initial,
  values,
  onChange,
}: {
  title: string;
  prefix: "position_before" | "position_after";
  position: PositionDto;
  initial: PositionFormState | null;
  values: PositionFormState | null;
  onChange: (v: PositionFormState) => void;
}) {
  const t = useTranslations("charges");
  if (!values || !initial) return null;

  function setField(f: PositionField, v: string) {
    onChange({ ...values!, [f]: v });
  }

  const edited = POSITION_FIELDS.some((f) => values[f].trim() !== initial[f].trim());

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          #{position.id} · {formatDate(position.date)}
          {edited ? ` · ${t("create.positions.editedHint")}` : ""}
        </p>
      </div>

      <input type="hidden" name={`${prefix}_id`} value={String(position.id)} />
      {POSITION_FIELDS.map((f) => (
        <input
          key={`${prefix}_initial_${f}`}
          type="hidden"
          name={`${prefix}_initial_${f}`}
          value={initial[f]}
        />
      ))}

      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id={`${prefix}_latitude`} label={t("fields.latitude")}>
          <NumberInput
            id={`${prefix}_latitude`}
            name={`${prefix}_latitude`}
            value={values.latitude}
            onChange={(e) => setField("latitude", (e.target as HTMLInputElement).value)}
            step="0.000001"
          />
        </FormField>
        <FormField id={`${prefix}_longitude`} label={t("fields.longitude")}>
          <NumberInput
            id={`${prefix}_longitude`}
            name={`${prefix}_longitude`}
            value={values.longitude}
            onChange={(e) => setField("longitude", (e.target as HTMLInputElement).value)}
            step="0.000001"
          />
        </FormField>
        <FormField id={`${prefix}_odometer`} label={t("fields.odometer")}>
          <NumberInput
            id={`${prefix}_odometer`}
            name={`${prefix}_odometer`}
            value={values.odometer}
            onChange={(e) => setField("odometer", (e.target as HTMLInputElement).value)}
            step="0.01"
          />
        </FormField>
        <FormField id={`${prefix}_battery_level`} label={t("fields.batteryLevel")}>
          <NumberInput
            id={`${prefix}_battery_level`}
            name={`${prefix}_battery_level`}
            value={values.battery_level}
            onChange={(e) =>
              setField("battery_level", (e.target as HTMLInputElement).value)
            }
            step="1"
            min={0}
            max={100}
          />
        </FormField>
        <FormField
          id={`${prefix}_usable_battery_level`}
          label={t("fields.usableBatteryLevel")}
        >
          <NumberInput
            id={`${prefix}_usable_battery_level`}
            name={`${prefix}_usable_battery_level`}
            value={values.usable_battery_level}
            onChange={(e) =>
              setField("usable_battery_level", (e.target as HTMLInputElement).value)
            }
            step="1"
            min={0}
            max={100}
          />
        </FormField>
        <FormField
          id={`${prefix}_outside_temp`}
          label={t("fields.outsideTemp")}
        >
          <NumberInput
            id={`${prefix}_outside_temp`}
            name={`${prefix}_outside_temp`}
            value={values.outside_temp}
            onChange={(e) =>
              setField("outside_temp", (e.target as HTMLInputElement).value)
            }
            step="0.1"
          />
        </FormField>
        <FormField id={`${prefix}_inside_temp`} label={t("fields.insideTemp")}>
          <NumberInput
            id={`${prefix}_inside_temp`}
            name={`${prefix}_inside_temp`}
            value={values.inside_temp}
            onChange={(e) =>
              setField("inside_temp", (e.target as HTMLInputElement).value)
            }
            step="0.1"
          />
        </FormField>
        <FormField
          id={`${prefix}_ideal_battery_range_km`}
          label={t("fields.idealBatteryRangeKm")}
        >
          <NumberInput
            id={`${prefix}_ideal_battery_range_km`}
            name={`${prefix}_ideal_battery_range_km`}
            value={values.ideal_battery_range_km}
            onChange={(e) =>
              setField(
                "ideal_battery_range_km",
                (e.target as HTMLInputElement).value,
              )
            }
            step="0.01"
          />
        </FormField>
        <FormField
          id={`${prefix}_rated_battery_range_km`}
          label={t("fields.ratedBatteryRangeKm")}
        >
          <NumberInput
            id={`${prefix}_rated_battery_range_km`}
            name={`${prefix}_rated_battery_range_km`}
            value={values.rated_battery_range_km}
            onChange={(e) =>
              setField(
                "rated_battery_range_km",
                (e.target as HTMLInputElement).value,
              )
            }
            step="0.01"
          />
        </FormField>
      </div>
    </section>
  );
}
