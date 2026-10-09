"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Plus } from "lucide-react";
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
import { formatDuration, formatDurationHHMM } from "@/lib/format/duration";
import { computeQuickRange, type QuickRangeKey } from "@/lib/positions/quick-ranges";
import type { DriveListSummary } from "@/lib/drives/list-query";
import {
  consumptionLabel,
  kmToUnit,
  lengthLabel,
  speedLabel,
  type LengthUnit,
  type TempUnit,
} from "@/lib/units";
import { GeofenceMultiSelect } from "./GeofenceMultiSelect";
import {
  useDriveColumns,
  DRIVE_DEFAULT_VISIBILITY,
  type DriveRow,
  type EfficiencyMode,
} from "./DriveDataTableColumns";

export type DriveListFilters = {
  from: string;
  to: string;
  qr: QuickRangeKey | null;
  open_only: boolean;
  min_dist: string;
  min_speed: string;
  location: string;
  geofence: number[];
  eff: EfficiencyMode;
};

export function DriveListClient({
  data,
  total,
  page,
  pageSize,
  filters,
  summary,
  units,
  geofenceInitial,
}: {
  data: DriveRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: DriveListFilters;
  summary: DriveListSummary;
  units: { length: LengthUnit; temp: TempUnit };
  geofenceInitial: FKOption[];
}) {
  const t = useTranslations("drives");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const columns = useDriveColumns({
    length: units.length,
    temp: units.temp,
    efficiencyMode: filters.eff,
  });
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [openOnly, setOpenOnly] = useState(filters.open_only);
  const [minDist, setMinDist] = useState(filters.min_dist);
  const [minSpeed, setMinSpeed] = useState(filters.min_speed);
  const [location, setLocation] = useState(filters.location);
  const [geofence, setGeofence] = useState<number[]>(filters.geofence);
  const [eff, setEff] = useState<EfficiencyMode>(filters.eff);

  // Visibilité des colonnes pilotée ici (menu rendu dans l'en-tête de page).
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(DRIVE_DEFAULT_VISIBILITY);

  useEffect(() => {
    // Hydratation one-shot depuis localStorage après le montage : volontairement
    // dans un effet (et non au 1er rendu) pour éviter tout mismatch SSR/CSR.
    try {
      const raw = window.localStorage.getItem("drives.columns");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setColumnVisibility((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("drives.columns", JSON.stringify(columnVisibility));
    } catch {
      /* ignore */
    }
  }, [columnVisibility]);

  const lu = lengthLabel(units.length);
  const su = speedLabel(units.length);

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
    setOrDel("min_dist", minDist);
    setOrDel("min_speed", minSpeed);
    setOrDel("location", location.trim());
    if (geofence.length) params.set("geofence", geofence.join(","));
    else params.delete("geofence");
    params.set("eff", eff);
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
    setMinDist("");
    setMinSpeed("");
    setLocation("");
    setGeofence([]);
    setEff("slope");
    router.push("?");
  }

  const num = (v: number | null, digits = 0) =>
    v == null ? "—" : format.number(v, { maximumFractionDigits: digits });
  // Wh/km → Wh/mi : on divise par le nombre de « mi » dans 1 km.
  const consumption =
    summary.consumption_wh_km == null
      ? null
      : summary.consumption_wh_km / kmToUnit(1, units.length);

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
            <ButtonLink size="sm" href="/drives/new">
              <Plus className="size-4" aria-hidden />
              {t("new")}
            </ButtonLink>
          </>
        }
        className="mb-0"
      />

      {/* Filtres : 6 par ligne sur grand écran → 2 lignes au plus. */}
      <form
        className="grid gap-x-3 gap-y-2 rounded-xl border bg-card p-3 shadow-sm sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"
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
        <FormField id="filter_min_dist" label={`${t("filters.minDist")} (${lu})`}>
          <Input
            id="filter_min_dist"
            type="number"
            min={0}
            step="0.1"
            value={minDist}
            onChange={(e) => setMinDist(e.target.value)}
          />
        </FormField>
        <FormField id="filter_min_speed" label={`${t("filters.minSpeed")} (${su})`}>
          <Input
            id="filter_min_speed"
            type="number"
            min={0}
            step="1"
            value={minSpeed}
            onChange={(e) => setMinSpeed(e.target.value)}
          />
        </FormField>
        <FormField id="filter_efficiency" label={t("filters.efficiency")}>
          <select
            id="filter_efficiency"
            value={eff}
            onChange={(e) => setEff(e.target.value as EfficiencyMode)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
          >
            <option value="slope">{t("efficiencyMode.slope")}</option>
            <option value="distance">{t("efficiencyMode.distance")}</option>
          </select>
        </FormField>
        {/* Dernière cellule : case « ouverts » + actions, alignées sur les champs. */}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
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
          { label: t("summary.count"), value: num(summary.count) },
          {
            label: t("summary.distance"),
            value:
              summary.distance_km == null
                ? "—"
                : `${num(kmToUnit(summary.distance_km, units.length))} ${lu}`,
          },
          {
            label: t("summary.duration"),
            value: formatDuration(
              summary.duration_min == null ? null : Math.round(summary.duration_min),
              t,
            ),
          },
          {
            label: t("summary.energy"),
            value: summary.energy_kwh == null ? "—" : `${num(summary.energy_kwh, 1)} kWh`,
          },
          {
            label: t("summary.consumption"),
            value: consumption == null ? "—" : `${num(consumption)} ${consumptionLabel(units.length)}`,
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
        {data.map((row) => (
          <Card key={row.id} size="sm">
            <CardContent className="space-y-1.5 pt-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-muted-foreground">#{row.id}</span>
                {!row.end_date ? (
                  <Badge variant="secondary">{t("ongoing")}</Badge>
                ) : null}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("columns.date")}</span>
                <span>{format.dateTime(new Date(row.start_date), "short")}</span>
              </div>
              <div>
                <span>
                  {row.start_address ?? "—"}
                  <span className="mx-1 text-muted-foreground">→</span>
                  {row.end_address ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("columns.distance")}</span>
                <span>
                  {row.distance != null
                    ? `${kmToUnit(row.distance, units.length).toFixed(1)} ${lu}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("columns.duration")}</span>
                <span>{formatDurationHHMM(row.duration_min)}</span>
              </div>
              <div className="pt-2">
                <ButtonLink
                  size="sm"
                  variant="outline"
                  href={`/drives/${row.id}`}
                  className="w-full"
                >
                  {tCommon("edit")}
                </ButtonLink>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <OffsetPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
