"use client";

import { useTranslations, useFormatter } from "next-intl";
import { FileSearch, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { VisibilityState } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form/form-field";
import { DateTimeInput } from "@/components/form/datetime-input";
import { QuickRangeSelect } from "@/components/form/quick-range-select";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnsMenu } from "@/components/data-table/columns-menu";
import { SummaryBar } from "@/components/data-table/summary-bar";
import { OffsetPagination } from "@/components/data-table/pagination";
import { PageHeader } from "@/components/app-shell/page-header";
import type { FKOption } from "@/components/form/fk-combobox";
import { GeofenceMultiSelect } from "@/components/entities/drives/GeofenceMultiSelect";
import { formatDuration } from "@/lib/format/duration";
import { computeQuickRange, type QuickRangeKey } from "@/lib/positions/quick-ranges";
import type { LengthUnit, TempUnit } from "@/lib/units";
import type { ChargeListSummary } from "@/lib/charges/list-query";
import { chargeEfficiencyPct, isSuspectEfficiency } from "@/lib/charges/metrics";
import {
  useChargeColumns,
  ChargeTypeBadge,
  CHARGE_DEFAULT_VISIBILITY,
  type ChargeRow,
} from "./ChargeDataTableColumns";

export type ChargeTypeFilter = "" | "AC" | "DC";

export type ChargeListFilters = {
  from: string;
  to: string;
  qr: QuickRangeKey | null;
  open_only: boolean;
  location: string;
  geofence: number[];
  type: ChargeTypeFilter;
  min_cost: string;
  min_duration: string;
  min_added: string;
  min_used: string;
  max_eff: string;
};

const COLUMNS_KEY = "charges.columns";

export function ChargeListClient({
  data,
  total,
  page,
  pageSize,
  filters,
  summary,
  units,
  geofenceInitial,
}: {
  data: ChargeRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: ChargeListFilters;
  summary: ChargeListSummary;
  units: { length: LengthUnit; temp: TempUnit };
  geofenceInitial: FKOption[];
}) {
  const t = useTranslations("charges");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const columns = useChargeColumns(units);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [openOnly, setOpenOnly] = useState(filters.open_only);
  const [location, setLocation] = useState(filters.location);
  const [geofence, setGeofence] = useState<number[]>(filters.geofence);
  const [type, setType] = useState<ChargeTypeFilter>(filters.type);
  const [minCost, setMinCost] = useState(filters.min_cost);
  const [minDuration, setMinDuration] = useState(filters.min_duration);
  const [minAdded, setMinAdded] = useState(filters.min_added);
  const [minUsed, setMinUsed] = useState(filters.min_used);
  const [maxEff, setMaxEff] = useState(filters.max_eff);

  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(CHARGE_DEFAULT_VISIBILITY);

  useEffect(() => {
    // Hydratation one-shot depuis localStorage après le montage : volontairement
    // dans un effet (et non au 1er rendu) pour éviter tout mismatch SSR/CSR.
    try {
      const raw = window.localStorage.getItem(COLUMNS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setColumnVisibility((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(columnVisibility));
    } catch {
      /* ignore */
    }
  }, [columnVisibility]);

  function buildParams(range?: { from: string; to: string; qr: string | null }) {
    const params = new URLSearchParams(searchParams.toString());
    const setOrDel = (key: string, val: string) =>
      val ? params.set(key, val) : params.delete(key);
    setOrDel("from", range ? range.from : from);
    setOrDel("to", range ? range.to : to);
    // Une plage saisie à la main efface le preset actif.
    setOrDel("qr", range?.qr ?? "");
    if (openOnly) params.set("open_only", "1");
    else params.delete("open_only");
    setOrDel("location", location.trim());
    if (geofence.length) params.set("geofence", geofence.join(","));
    else params.delete("geofence");
    setOrDel("type", type);
    setOrDel("min_cost", minCost);
    setOrDel("min_duration", minDuration);
    setOrDel("min_added", minAdded);
    setOrDel("min_used", minUsed);
    setOrDel("max_eff", maxEff);
    params.set("page", "1");
    return params;
  }

  function applyFilters() {
    router.push(`?${buildParams().toString()}`);
  }

  function pushQuickRange(key: QuickRangeKey) {
    const range = computeQuickRange(key);
    if (!range) return;
    const f = range.from.toISOString();
    const tt = range.to.toISOString();
    setFrom(f);
    setTo(tt);
    router.push(`?${buildParams({ from: f, to: tt, qr: key }).toString()}`);
  }

  function resetFilters() {
    setFrom("");
    setTo("");
    setOpenOnly(false);
    setLocation("");
    setGeofence([]);
    setType("");
    setMinCost("");
    setMinDuration("");
    setMinAdded("");
    setMinUsed("");
    setMaxEff("");
    router.push("?");
  }

  const numInput = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    step = "1",
  ) => (
    <FormField id={id} label={label}>
      <Input
        id={id}
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </FormField>
  );

  const kwh = (v: number | null) =>
    v == null ? "—" : `${format.number(v, { maximumFractionDigits: 1 })} kWh`;

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <ColumnsMenu
              label={t("columnsMenu")}
              columns={columns}
              visibility={columnVisibility}
              onChange={setColumnVisibility}
            />
            <ButtonLink size="sm" variant="outline" href="/privacy">
              <FileSearch className="size-4" aria-hidden />
              {t("compareWithTesla")}
            </ButtonLink>
            <ButtonLink size="sm" href="/charges/new">
              <Plus className="size-4" aria-hidden />
              {t("new")}
            </ButtonLink>
          </>
        }
        className="mb-0"
      />

      {/* Filtres : 6 par ligne sur grand écran → 2 lignes. */}
      <form
        className="grid gap-x-3 gap-y-2 rounded-xl border bg-card p-3 shadow-sm sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
      >
        <FormField id="filter_qr" label={t("filters.quickRange")}>
          <QuickRangeSelect id="filter_qr" value={filters.qr} onPick={pushQuickRange} />
        </FormField>
        <FormField id="filter_from" label={t("filters.from")}>
          <DateTimeInput
            id="filter_from"
            value={from}
            onChange={(e) => setFrom((e.target as HTMLInputElement).value)}
          />
        </FormField>
        <FormField id="filter_to" label={t("filters.to")}>
          <DateTimeInput
            id="filter_to"
            value={to}
            onChange={(e) => setTo((e.target as HTMLInputElement).value)}
          />
        </FormField>
        <FormField id="filter_type" label={t("filters.type")}>
          <select
            id="filter_type"
            value={type}
            onChange={(e) => setType(e.target.value as ChargeTypeFilter)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
          >
            <option value="">{t("filters.all")}</option>
            <option value="AC">{t("type.ac")}</option>
            <option value="DC">{t("type.dc")}</option>
          </select>
        </FormField>
        <FormField id="filter_location" label={t("filters.location")}>
          <Input
            id="filter_location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("filters.locationPlaceholder")}
          />
        </FormField>
        <FormField id="filter_geofence" label={t("filters.geofence")}>
          <GeofenceMultiSelect value={geofence} initial={geofenceInitial} onChange={setGeofence} />
        </FormField>
        {numInput("filter_min_added", `${t("filters.minAdded")} (kWh)`, minAdded, setMinAdded, "0.1")}
        {numInput("filter_min_used", `${t("filters.minUsed")} (kWh)`, minUsed, setMinUsed, "0.1")}
        {numInput("filter_max_eff", `${t("filters.maxEfficiency")} (%)`, maxEff, setMaxEff)}
        {numInput("filter_min_cost", t("filters.minCost"), minCost, setMinCost, "0.01")}
        {numInput("filter_min_duration", `${t("filters.minDuration")} (min)`, minDuration, setMinDuration)}
        {/* Dernière cellule : case « ouvertes » + actions, alignées sur les champs. */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex h-8 shrink-0 cursor-pointer items-center gap-2 px-1 text-sm">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
              className="size-4 cursor-pointer accent-tesla-red"
            />
            {t("filters.openOnly")}
          </label>
          <Button type="submit" size="sm">
            {t("filters.apply")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={resetFilters}>
            {t("filters.reset")}
          </Button>
        </div>
      </form>

      <SummaryBar
        title={t("summary.title")}
        items={[
          { label: t("summary.count"), value: format.number(summary.count) },
          { label: t("summary.energyAdded"), value: kwh(summary.energy_added) },
          { label: t("summary.energyUsed"), value: kwh(summary.energy_used) },
          {
            label: t("summary.cost"),
            value:
              summary.cost == null
                ? "—"
                : format.number(summary.cost, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          },
          {
            label: t("summary.avgDuration"),
            value: formatDuration(
              summary.avg_duration_min == null ? null : Math.round(summary.avg_duration_min),
              t,
            ),
          },
        ]}
      />

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={data}
          emptyMessage={t("empty")}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          scrollX
          dense
        />
      </div>

      <div className="grid gap-3 md:hidden">
        {data.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}
        {data.map((row) => {
          const eff = chargeEfficiencyPct(row);
          return (
            <Card key={row.id} size="sm">
              <CardContent className="space-y-1.5 pt-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-muted-foreground">#{row.id}</span>
                  {!row.end_date ? <Badge variant="secondary">{t("ongoing")}</Badge> : null}
                  <ChargeTypeBadge type={row.charge_type} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.startDate")}</span>
                  <span>{format.dateTime(new Date(row.start_date), "short")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.place")}</span>
                  <span>{row.place ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.chargeEnergyAdded")}</span>
                  <span>
                    {row.charge_energy_added != null
                      ? `${row.charge_energy_added.toFixed(2)} kWh`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.efficiencyPct")}</span>
                  <span className={isSuspectEfficiency(eff) ? "font-semibold text-warn" : ""}>
                    {eff != null ? `${eff.toFixed(0)} %` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.durationMin")}</span>
                  <span>{formatDuration(row.duration_min, t)}</span>
                </div>
                <div className="pt-2">
                  <ButtonLink
                    size="sm"
                    variant="outline"
                    href={`/charges/${row.id}`}
                    className="w-full"
                  >
                    {tCommon("edit")}
                  </ButtonLink>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <OffsetPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
