"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, ExternalLink, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  GENERALLY_FILLED_RATIO,
  POSITION_SCALAR_COLUMNS,
  type PositionScalarColumn,
  type PositionScalarKey,
} from "@/lib/positions/columns";
import {
  POSITION_ORIGINS,
  type OriginCounts,
  type PositionOrigin,
} from "@/lib/positions/origin";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  computeDeltas,
  matchesFilters,
  type DrivePositionFilters,
} from "@/lib/positions/drive-filters";
import type { DrivePositionRow } from "@/lib/drives/positions-detail";
import { OriginBadge } from "@/components/entities/positions/OriginBadge";

const PAGE_SIZE = 100;
const COLUMNS_KEY = "drives.positions.columns";

function parseNum(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function renderValue(col: PositionScalarColumn, v: number | boolean | undefined): string {
  if (v == null) return "—";
  if (col.kind === "bool") return v ? "✓" : "✗";
  if (typeof v !== "number") return String(v);
  switch (col.kind) {
    case "km":
      return v.toFixed(3);
    case "percent":
      return `${v} %`;
    default:
      return String(v);
  }
}

/** Champ numérique compact « min – max ». */
function RangeField({
  label,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string;
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  const t = useTranslations("drives.positionsTab.filters");
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <Input
          inputMode="decimal"
          placeholder={t("min")}
          value={min}
          onChange={(e) => onMin(e.target.value)}
          className="h-8"
          aria-label={`${label} ${t("min")}`}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          inputMode="decimal"
          placeholder={t("max")}
          value={max}
          onChange={(e) => onMax(e.target.value)}
          className="h-8"
          aria-label={`${label} ${t("max")}`}
        />
      </div>
    </div>
  );
}

export function DrivePositionsPanel({
  driveId,
  rows,
  total,
  truncated,
  cap,
  filled,
  originCounts,
}: {
  driveId: number;
  rows: DrivePositionRow[];
  total: number;
  truncated: boolean;
  cap: number;
  filled: Record<PositionScalarKey, number>;
  originCounts: OriginCounts;
}) {
  const t = useTranslations("drives.positionsTab");
  const tPos = useTranslations("positions");
  const format = useFormatter();

  // --- Colonnes : par défaut celles remplies sur ≥ 50 % des positions AFFICHÉES
  // (calcul après filtrage, plus bas). Choix explicites mémorisés ici.
  const loaded = rows.length;
  const [visibility, setVisibility] = useState<Partial<Record<PositionScalarKey, boolean>>>({});
  useEffect(() => {
    // Hydratation one-shot depuis localStorage après le montage (pas au 1er
    // rendu) pour éviter tout mismatch SSR/CSR — même principe que les charges.
    try {
      const raw = window.localStorage.getItem(COLUMNS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setVisibility(JSON.parse(raw) as Partial<Record<PositionScalarKey, boolean>>);
    } catch {
      /* ignore */
    }
  }, []);
  function setColumn(k: PositionScalarKey, on: boolean) {
    setVisibility((prev) => {
      const next = { ...prev, [k]: on };
      try {
        window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
      } catch {
        // stockage indisponible : préférence non mémorisée
      }
      return next;
    });
  }

  // --- Filtres (saisie brute conservée pour ne pas réécrire ce que l'utilisateur tape).
  const [origins, setOrigins] = useState<PositionOrigin[]>([]);
  const [speedMin, setSpeedMin] = useState("");
  const [speedMax, setSpeedMax] = useState("");
  const [powerMin, setPowerMin] = useState("");
  const [powerMax, setPowerMax] = useState("");
  const [emptyColumn, setEmptyColumn] = useState<PositionScalarKey | "">("");
  const [gapMin, setGapMin] = useState("");
  const [jumpMin, setJumpMin] = useState("");
  const [page, setPage] = useState(0);

  const filters = useMemo<DrivePositionFilters>(
    () => ({
      origins,
      speedMin: parseNum(speedMin),
      speedMax: parseNum(speedMax),
      powerMin: parseNum(powerMin),
      powerMax: parseNum(powerMax),
      emptyColumn: emptyColumn === "" ? null : emptyColumn,
      gapMinS: parseNum(gapMin),
      jumpMinM: parseNum(jumpMin),
    }),
    [origins, speedMin, speedMax, powerMin, powerMax, emptyColumn, gapMin, jumpMin],
  );

  const deltas = useMemo(() => computeDeltas(rows), [rows]);
  const filtered = useMemo(() => {
    const out: number[] = [];
    rows.forEach((r, i) => {
      if (matchesFilters(r, deltas[i], filters)) out.push(i);
    });
    return out;
  }, [rows, deltas, filters]);

  // Taux de remplissage sur les positions filtrées : filtrer sur « Fleet API »
  // fait apparaître pneus, climatisation, chauffage, températures… remplis par
  // les seuls appels vehicle_data, minoritaires sur un trajet en flux.
  const shownFilled = useMemo(() => {
    const out = Object.fromEntries(POSITION_SCALAR_COLUMNS.map((c) => [c.key, 0])) as Record<
      PositionScalarKey,
      number
    >;
    for (const i of filtered) {
      for (const c of POSITION_SCALAR_COLUMNS) if (rows[i].v[c.key] != null) out[c.key] += 1;
    }
    return out;
  }, [rows, filtered]);
  const fillRatio = (k: PositionScalarKey) =>
    filtered.length > 0 ? shownFilled[k] / filtered.length : 0;
  const isVisible = (k: PositionScalarKey) =>
    shownFilled[k] > 0 && (visibility[k] ?? fillRatio(k) >= GENERALLY_FILLED_RATIO);
  const columns = POSITION_SCALAR_COLUMNS.filter((c) => isVisible(c.key));

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageRows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const active = activeFilterCount(filters);

  function update<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }
  function toggleOrigin(o: PositionOrigin) {
    setOrigins((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
    setPage(0);
  }
  function reset() {
    setOrigins(EMPTY_FILTERS.origins);
    setSpeedMin("");
    setSpeedMax("");
    setPowerMin("");
    setPowerMax("");
    setEmptyColumn("");
    setGapMin("");
    setJumpMin("");
    setPage(0);
  }

  const originChoices = POSITION_ORIGINS.filter((o) => originCounts[o] > 0);
  const columnLabel = (c: PositionScalarColumn) => tPos(`fields.${c.labelKey}`);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-3">

      {/* Bloc de filtres */}
      <div className="space-y-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {t("filters.title")}
            {active > 0 ? (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {t("filters.active", { n: active })}
              </span>
            ) : null}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {active > 0 ? (
              <Button size="sm" variant="ghost" onClick={reset}>
                {t("filters.reset")}
              </Button>
            ) : null}
            <details className="relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium shadow-sm [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal className="size-4" aria-hidden />
                {t("columns.menu")}
              </summary>
              <div className="absolute right-0 z-20 mt-1 max-h-80 w-72 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                {POSITION_SCALAR_COLUMNS.map((c) => {
                  const empty = shownFilled[c.key] === 0;
                  return (
                    <label
                      key={c.key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                        empty && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isVisible(c.key)}
                        disabled={empty}
                        onChange={(e) => setColumn(c.key, e.target.checked)}
                        className="size-3.5"
                      />
                      <span className="flex-1">{columnLabel(c)}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {empty
                          ? t("columns.empty")
                          : `${Math.round(fillRatio(c.key) * 100)} %`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </details>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <fieldset className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <legend className="text-xs font-medium text-muted-foreground">
              {t("filters.origin")}
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {originChoices.map((o) => (
                <label key={o} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={origins.includes(o)}
                    onChange={() => toggleOrigin(o)}
                    className="size-3.5"
                  />
                  <OriginBadge origin={o} />
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {originCounts[o]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <RangeField
            label={tPos("fields.speed")}
            min={speedMin}
            max={speedMax}
            onMin={update(setSpeedMin)}
            onMax={update(setSpeedMax)}
          />
          <div className="space-y-1.5">
            <RangeField
              label={tPos("fields.power")}
              min={powerMin}
              max={powerMax}
              onMin={update(setPowerMin)}
              onMax={update(setPowerMax)}
            />
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => {
                setPowerMin("");
                setPowerMax("-1");
                setPage(0);
              }}
            >
              {t("filters.regenOnly")}
            </button>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="drive-pos-gap" className="text-xs font-medium text-muted-foreground">
              {t("filters.gap")}
            </label>
            <Input
              id="drive-pos-gap"
              inputMode="decimal"
              placeholder="ex. 30"
              value={gapMin}
              onChange={(e) => update(setGapMin)(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="drive-pos-jump" className="text-xs font-medium text-muted-foreground">
              {t("filters.jump")}
            </label>
            <Input
              id="drive-pos-jump"
              inputMode="decimal"
              placeholder="ex. 500"
              value={jumpMin}
              onChange={(e) => update(setJumpMin)(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("filters.emptyColumn")}
            </span>
            <Select
              value={emptyColumn}
              onValueChange={(v) => update(setEmptyColumn)((typeof v === "string" ? v : "") as PositionScalarKey | "")}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue placeholder={t("filters.anyColumn")}>
                  {(v: string) =>
                    v ? columnLabel(POSITION_SCALAR_COLUMNS.find((c) => c.key === v)!) : t("filters.anyColumn")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("filters.anyColumn")}</SelectItem>
                {POSITION_SCALAR_COLUMNS.filter((c) => filled[c.key] < loaded).map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {columnLabel(c)} ({loaded - filled[c.key]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("count", { shown: filtered.length, total })}
          {truncated ? <span className="ml-2 text-warn">{t("truncated", { cap })}</span> : null}
        </p>
        <ButtonLink size="sm" variant="outline" href={`/positions?drive_id=${driveId}`}>
          {t("viewAll")}
        </ButtonLink>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-xs">id</TableHead>
              <TableHead className="whitespace-nowrap">{t("columns.time")}</TableHead>
              <TableHead className="whitespace-nowrap">{tPos("origin.column")}</TableHead>
              <TableHead className="whitespace-nowrap text-right">{t("columns.dt")}</TableHead>
              <TableHead className="whitespace-nowrap text-right">{t("columns.dd")}</TableHead>
              <TableHead className="whitespace-nowrap">{t("columns.latLon")}</TableHead>
              {columns.map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap text-right">
                  {columnLabel(c)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6 + columns.length} className="h-20 text-center text-sm text-muted-foreground">
                  {t("noMatch")}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((i) => {
                const p = rows[i];
                const d = deltas[i];
                const date = new Date(p.date);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs tabular-nums">
                      <Link href={`/positions/${p.id}`} className="underline-offset-2 hover:underline">
                        {p.id}
                      </Link>
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap font-mono text-xs tabular-nums"
                      title={format.dateTime(date, "short")}
                    >
                      {format.dateTime(date, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                    </TableCell>
                    <TableCell>
                      <OriginBadge origin={p.origin} d13Kind={p.d13Kind} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {d.dtS == null ? "—" : Math.round(d.dtS)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {d.dM == null ? "—" : Math.round(d.dM)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}&zoom=17`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:underline"
                        title={tPos("openOsm")}
                      >
                        {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                        <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
                      </a>
                    </TableCell>
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(
                          "whitespace-nowrap text-right font-mono text-xs tabular-nums",
                          p.v[c.key] == null && "text-muted-foreground/60",
                        )}
                      >
                        {renderValue(c, p.v[c.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            aria-label={t("pager.prev")}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {t("pager.page", { page: current + 1, pages })}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            aria-label={t("pager.next")}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
