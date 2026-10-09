import type { TeslaChargeKind, TeslaChargeSession } from "./charging-csv";

/**
 * Comparaison des sessions de charge vues par Tesla (export Privacy) avec celles
 * enregistrées par TeslaMate. Les deux sources ne découpent pas les recharges de
 * la même façon (Tesla : plusieurs sessions pour une recharge interrompue ;
 * TeslaMate : une recharge coupée en deux après une perte réseau). On compare
 * donc par **groupes** de sessions qui se chevauchent dans le temps, toutes
 * sources confondues, puis on classe chaque groupe. Fonctions pures (testées).
 */

export type TmChargeSession = {
  id: number;
  carId: number;
  /** ISO UTC */
  start: string;
  /** ISO UTC — fin effective (end_date, sinon dernier tick, sinon début). */
  end: string;
  /** true si `end_date` est NULL en base (session restée ouverte). */
  open: boolean;
  energyAddedKwh: number | null;
};

export type CompareKind = "ok" | "missing" | "extra" | "energy_mismatch" | "fragmented";

export type CompareGroup = {
  kind: CompareKind;
  severity: "info" | "warn";
  vin: string;
  carId: number;
  /** ISO UTC, bornes du groupe (toutes sources). */
  start: string;
  end: string;
  tesla: TeslaChargeSession[];
  tm: TmChargeSession[];
  teslaKwh: number;
  tmKwh: number;
  /** TeslaMate − Tesla */
  diffKwh: number;
  /** Type de recharge selon Tesla (DC si au moins une session DC). */
  teslaKind: TeslaChargeKind | null;
  /** extra : session vide (≈ 0 kWh, ≤ 2 min) → à supprimer. */
  emptyExtra: boolean;
  /** Plus grand décalage de bornes (min) entre Tesla et TeslaMate, si > seuil. */
  dateShiftMin: number | null;
};

export type CompareOptions = {
  /** Tolérance aux bords pour regrouper (min). Le début TeslaMate retarde de quelques minutes. */
  joinToleranceMin: number;
  /** Écart d'énergie toléré : max(abs, rel × énergie Tesla). */
  energyTolKwh: number;
  energyTolRel: number;
  /** Sous ce total, une session manquante est seulement informative. */
  minMissingKwh: number;
  /** Décalage de dates signalé au-delà de ce seuil (min). */
  dateShiftMin: number;
};

export const DEFAULT_COMPARE_OPTIONS: CompareOptions = {
  joinToleranceMin: 10,
  energyTolKwh: 0.5,
  energyTolRel: 0.05,
  minMissingKwh: 0.5,
  dateShiftMin: 15,
};

export type CompareReport = {
  groups: CompareGroup[];
  counts: Record<CompareKind, number>;
  /** Groupes nécessitant une action (hors ok et hors info). */
  toFix: number;
  /** VIN présents dans l'export mais inconnus de TeslaMate. */
  unknownVins: string[];
};

export type ImportPeriod = { vin: string; carId: number; from: string; to: string };

const MIN = 60_000;

/** Période couverte par l'export, par VIN connu : [premier début, dernière fin]. */
export function importPeriods(
  sessions: TeslaChargeSession[],
  carIdByVin: Map<string, number>,
): ImportPeriod[] {
  const byVin = new Map<string, { from: number; to: number }>();
  for (const s of sessions) {
    const a = Date.parse(s.start);
    const b = Date.parse(s.end);
    const cur = byVin.get(s.vin);
    byVin.set(s.vin, cur ? { from: Math.min(cur.from, a), to: Math.max(cur.to, b) } : { from: a, to: b });
  }
  const out: ImportPeriod[] = [];
  for (const [vin, p] of byVin) {
    const carId = carIdByVin.get(vin);
    if (carId == null) continue;
    out.push({ vin, carId, from: new Date(p.from).toISOString(), to: new Date(p.to).toISOString() });
  }
  return out;
}

type Item =
  | { src: "tesla"; s: number; e: number; v: TeslaChargeSession }
  | { src: "tm"; s: number; e: number; v: TmChargeSession };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function compareCharges(
  teslaSessions: TeslaChargeSession[],
  tmSessions: TmChargeSession[],
  carIdByVin: Map<string, number>,
  opts: CompareOptions = DEFAULT_COMPARE_OPTIONS,
): CompareReport {
  const tol = opts.joinToleranceMin * MIN;
  const unknownVins = [...new Set(teslaSessions.map((s) => s.vin))].filter(
    (v) => !carIdByVin.has(v),
  );
  const groups: CompareGroup[] = [];

  for (const period of importPeriods(teslaSessions, carIdByVin)) {
    const pFrom = Date.parse(period.from) - tol;
    const pTo = Date.parse(period.to) + tol;
    const items: Item[] = [
      ...teslaSessions
        .filter((s) => s.vin === period.vin)
        .map((v) => ({ src: "tesla" as const, s: Date.parse(v.start), e: Date.parse(v.end), v })),
      ...tmSessions
        .filter((t) => t.carId === period.carId)
        .map((v) => ({ src: "tm" as const, s: Date.parse(v.start), e: Date.parse(v.end), v }))
        .filter((i) => i.s >= pFrom && i.s <= pTo),
    ].sort((a, b) => a.s - b.s || a.e - b.e);

    // Balayage : un élément rejoint le groupe courant s'il commence avant la fin
    // (tolérance comprise) de ce groupe.
    let cur: Item[] = [];
    let curEnd = -Infinity;
    const flush = () => {
      if (cur.length) groups.push(classify(cur, period, opts));
      cur = [];
      curEnd = -Infinity;
    };
    for (const it of items) {
      if (cur.length && it.s > curEnd + tol) flush();
      cur.push(it);
      curEnd = Math.max(curEnd, it.e);
    }
    flush();
  }

  groups.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const counts: Record<CompareKind, number> = {
    ok: 0, missing: 0, extra: 0, energy_mismatch: 0, fragmented: 0,
  };
  for (const g of groups) counts[g.kind]++;
  const toFix = groups.filter((g) => g.kind !== "ok" && g.severity === "warn").length;
  return { groups, counts, toFix, unknownVins };
}

function classify(items: Item[], period: ImportPeriod, opts: CompareOptions): CompareGroup {
  const tesla = items.filter((i) => i.src === "tesla").map((i) => i.v as TeslaChargeSession);
  const tm = items.filter((i) => i.src === "tm").map((i) => i.v as TmChargeSession);
  const teslaKwh = round2(tesla.reduce((a, s) => a + s.energyAddedKwh, 0));
  const tmKwh = round2(tm.reduce((a, s) => a + (s.energyAddedKwh ?? 0), 0));
  const diffKwh = round2(tmKwh - teslaKwh);
  const start = Math.min(...items.map((i) => i.s));
  const end = Math.max(...items.map((i) => i.e));
  const energyOk = Math.abs(diffKwh) <= Math.max(opts.energyTolKwh, opts.energyTolRel * teslaKwh);

  let kind: CompareKind;
  let severity: "info" | "warn" = "warn";
  let emptyExtra = false;
  if (tm.length === 0) {
    kind = "missing";
    if (teslaKwh < opts.minMissingKwh) severity = "info";
  } else if (tesla.length === 0) {
    kind = "extra";
    emptyExtra = tm.every((s) => {
      const durMin = (Date.parse(s.end) - Date.parse(s.start)) / MIN;
      return (s.energyAddedKwh ?? 0) <= 0.05 && durMin <= 2;
    });
  } else if (tm.length > tesla.length) {
    // TeslaMate a coupé une recharge que Tesla voit d'un seul tenant (perte
    // réseau, session restée ouverte…). Si les deux découpent pareil, c'est ok.
    kind = "fragmented";
  } else {
    kind = energyOk ? "ok" : "energy_mismatch";
    if (kind === "ok") severity = "info";
  }

  let dateShiftMin: number | null = null;
  if (tesla.length && tm.length) {
    const tS = Math.min(...tesla.map((s) => Date.parse(s.start)));
    const tE = Math.max(...tesla.map((s) => Date.parse(s.end)));
    const mS = Math.min(...tm.map((s) => Date.parse(s.start)));
    const mE = Math.max(...tm.map((s) => Date.parse(s.end)));
    const shift = Math.max(Math.abs(mS - tS), Math.abs(mE - tE)) / MIN;
    if (shift > opts.dateShiftMin) dateShiftMin = Math.round(shift);
  }

  return {
    kind,
    severity,
    vin: period.vin,
    carId: period.carId,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    tesla,
    tm,
    teslaKwh,
    tmKwh,
    diffKwh,
    teslaKind: tesla.length ? (tesla.some((s) => s.kind === "DC") ? "DC" : "AC") : null,
    emptyExtra,
    dateShiftMin,
  };
}
