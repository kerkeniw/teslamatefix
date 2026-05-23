import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function findOverlappingSession(
  carId: number,
  startDate: Date,
  endDate: Date | null,
  excludeId: number | null = null,
): Promise<{ id: number; start_date: Date; end_date: Date | null } | null> {
  const idFilter = excludeId == null ? {} : { id: { not: excludeId } };
  const range: Prisma.charging_processesWhereInput =
    endDate == null
      ? {
          OR: [
            { end_date: null },
            { end_date: { gte: startDate } },
          ],
        }
      : {
          start_date: { lt: endDate },
          OR: [
            { end_date: null },
            { end_date: { gt: startDate } },
          ],
        };

  return prisma.charging_processes.findFirst({
    where: { car_id: carId, ...idFilter, ...range },
    select: { id: true, start_date: true, end_date: true },
    orderBy: { start_date: "asc" },
  });
}

export type ProcessRecalc = {
  start_date: Date | null;
  end_date: Date | null;
  duration_min: number | null;
  charge_energy_added: number | null;
  start_battery_level: number | null;
  end_battery_level: number | null;
};

export async function recalcFromTicks(
  processId: number,
): Promise<{ before: ProcessRecalc; after: ProcessRecalc }> {
  const proc = await prisma.charging_processes.findUnique({
    where: { id: processId },
    select: {
      start_date: true,
      end_date: true,
      duration_min: true,
      charge_energy_added: true,
      start_battery_level: true,
      end_battery_level: true,
    },
  });
  if (!proc) {
    throw new Error(`charging_process ${processId} not found`);
  }

  const before: ProcessRecalc = {
    start_date: proc.start_date,
    end_date: proc.end_date,
    duration_min: proc.duration_min ?? null,
    charge_energy_added:
      proc.charge_energy_added != null ? Number(proc.charge_energy_added) : null,
    start_battery_level: proc.start_battery_level ?? null,
    end_battery_level: proc.end_battery_level ?? null,
  };

  // Agrégats des ticks. `charge_energy_added` est cumulatif côté TeslaMate :
  // le dernier tick contient le total, donc on prend le MAX. battery_level
  // peut osciller pendant la session ; on prend MIN/MAX pour border l'enveloppe
  // start/end. La durée est reconstruite à partir de l'enveloppe temporelle.
  const agg = await prisma.charges.aggregate({
    where: { charging_process_id: processId },
    _min: { date: true, battery_level: true },
    _max: { date: true, battery_level: true, charge_energy_added: true },
    _count: { _all: true },
  });

  if (agg._count._all === 0) {
    return { before, after: { ...before } };
  }

  // Pour start/end battery_level on prend le tick chronologique de bord — un
  // SOC qui descend en début de session (charge fictive perdue) ne doit pas
  // être confondu avec le start.
  const [firstTick, lastTick] = await Promise.all([
    prisma.charges.findFirst({
      where: { charging_process_id: processId },
      orderBy: { date: "asc" },
      select: { battery_level: true },
    }),
    prisma.charges.findFirst({
      where: { charging_process_id: processId },
      orderBy: { date: "desc" },
      select: { battery_level: true },
    }),
  ]);

  const startDate = agg._min.date;
  const endDate = agg._max.date;
  const durationMin =
    startDate && endDate
      ? Math.round((endDate.getTime() - startDate.getTime()) / 60000)
      : null;

  const after: ProcessRecalc = {
    start_date: startDate ?? before.start_date,
    end_date: endDate ?? before.end_date,
    duration_min: durationMin,
    charge_energy_added:
      agg._max.charge_energy_added != null
        ? Number(agg._max.charge_energy_added)
        : null,
    start_battery_level: firstTick?.battery_level ?? null,
    end_battery_level: lastTick?.battery_level ?? null,
  };

  return { before, after };
}

export type ChargerType = "AC" | "DC" | "unknown" | "mixed";

export type ChargerTypeDerived = {
  chargerType: ChargerType;
  trueCount: number;
  falseCount: number;
  nullCount: number;
  // Renseigné uniquement quand chargerType === "mixed" : c'est le type lu
  // sur le dernier tick chronologique (fallback d'affichage).
  fallbackFromLastTick: "AC" | "DC" | "unknown" | null;
};

/**
 * Vote majoritaire sur `fast_charger_present` à travers tous les ticks d'une
 * session. NULL ignorés. Coexistence true/false → "mixed" + fallback sur le
 * dernier tick. Un seul groupBy suffit ; on n'appelle findFirst que dans le
 * cas dégénéré "mixed".
 */
export async function deriveChargerTypeFromTicks(
  processId: number,
): Promise<ChargerTypeDerived> {
  const groups = await prisma.charges.groupBy({
    by: ["fast_charger_present"],
    where: { charging_process_id: processId },
    _count: { _all: true },
  });

  let trueCount = 0;
  let falseCount = 0;
  let nullCount = 0;
  for (const g of groups) {
    if (g.fast_charger_present === true) trueCount = g._count._all;
    else if (g.fast_charger_present === false) falseCount = g._count._all;
    else nullCount = g._count._all;
  }

  if (trueCount === 0 && falseCount === 0) {
    return { chargerType: "unknown", trueCount, falseCount, nullCount, fallbackFromLastTick: null };
  }
  if (trueCount > 0 && falseCount > 0) {
    const last = await prisma.charges.findFirst({
      where: { charging_process_id: processId },
      orderBy: { date: "desc" },
      select: { fast_charger_present: true },
    });
    const fallback: "AC" | "DC" | "unknown" =
      last?.fast_charger_present === true
        ? "DC"
        : last?.fast_charger_present === false
          ? "AC"
          : "unknown";
    return { chargerType: "mixed", trueCount, falseCount, nullCount, fallbackFromLastTick: fallback };
  }
  return {
    chargerType: trueCount > 0 ? "DC" : "AC",
    trueCount,
    falseCount,
    nullCount,
    fallbackFromLastTick: null,
  };
}

/**
 * Garantit que les nouvelles bornes de session encadrent les ticks
 * intermédiaires : start_date < second tick chronologique, end_date >
 * avant-dernier tick chronologique. Si la session a moins de 2 ticks, aucune
 * contrainte n'est appliquée (premier et dernier tick suffisent à les
 * autoriser).
 */
export async function validateDateBoundsAgainstTicks(
  processId: number,
  startDate: Date,
  endDate: Date | null,
): Promise<Record<string, string>> {
  const [secondTick, penultimateTick] = await Promise.all([
    prisma.charges.findFirst({
      where: { charging_process_id: processId },
      orderBy: { date: "asc" },
      skip: 1,
      select: { date: true },
    }),
    prisma.charges.findFirst({
      where: { charging_process_id: processId },
      orderBy: { date: "desc" },
      skip: 1,
      select: { date: true },
    }),
  ]);

  const errors: Record<string, string> = {};
  if (secondTick && startDate.getTime() >= secondTick.date.getTime()) {
    errors.start_date = "startAfterSecondTick";
  }
  if (penultimateTick && endDate != null && endDate.getTime() <= penultimateTick.date.getTime()) {
    errors.end_date = "endBeforeOrEqualPenultimateTick";
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Contexte borne (édition d'une charge) : valeurs du dernier tick + stats
// d'homogénéité par champ. Permet à la section Borne du form d'afficher des
// hints "min/max" ou "valeurs : a, b" et de proposer un mass-update opt-in.
// ---------------------------------------------------------------------------

export const CHARGER_TICK_FIELDS = [
  "charger_voltage",
  "charger_phases",
  "charger_actual_current",
  "charger_pilot_current",
  "charger_power",
  "conn_charge_cable",
  "fast_charger_brand",
  "fast_charger_type",
  "battery_heater_on",
  "battery_heater",
] as const;

export type ChargerTickField = (typeof CHARGER_TICK_FIELDS)[number];

export type ChargerFieldStats = {
  uniform: boolean;
  // Strings sérialisées des valeurs distinctes rencontrées (NULL inclus
  // explicitement comme "null" si présent), triées, max ~10.
  distinct: string[];
  // Pour les champs numériques uniquement.
  min?: number;
  max?: number;
};

export type ChargerTickValues = {
  charger_voltage: number | null;
  charger_phases: number | null;
  charger_actual_current: number | null;
  charger_pilot_current: number | null;
  charger_power: number | null;
  conn_charge_cable: string | null;
  fast_charger_brand: string | null;
  fast_charger_type: string | null;
  battery_heater_on: boolean | null;
  battery_heater: boolean | null;
};

export type ChargerTicksContext = {
  lastTickValues: ChargerTickValues;
  stats: Record<ChargerTickField, ChargerFieldStats>;
  ticksCount: number;
};

const NUMERIC_CHARGER_FIELDS = new Set<ChargerTickField>([
  "charger_voltage",
  "charger_phases",
  "charger_actual_current",
  "charger_pilot_current",
  "charger_power",
]);

function emptyStats(): ChargerFieldStats {
  return { uniform: true, distinct: [] };
}

/**
 * Lit tous les ticks d'une session et calcule, pour chaque champ borne :
 * - sa valeur sur le dernier tick (pré-remplissage form) ;
 * - les valeurs distinctes rencontrées (capées à 10) ;
 * - le min/max si numérique.
 *
 * Un seul findMany. Acceptable jusqu'à quelques centaines de ticks ;
 * au-delà on basculera sur des aggregate par champ.
 */
export async function deriveChargerTicksContext(
  processId: number,
): Promise<ChargerTicksContext> {
  const ticks = await prisma.charges.findMany({
    where: { charging_process_id: processId },
    orderBy: { date: "asc" },
    select: {
      charger_voltage: true,
      charger_phases: true,
      charger_actual_current: true,
      charger_pilot_current: true,
      charger_power: true,
      conn_charge_cable: true,
      fast_charger_brand: true,
      fast_charger_type: true,
      battery_heater_on: true,
      battery_heater: true,
    },
  });

  const stats: Record<ChargerTickField, ChargerFieldStats> = {
    charger_voltage: emptyStats(),
    charger_phases: emptyStats(),
    charger_actual_current: emptyStats(),
    charger_pilot_current: emptyStats(),
    charger_power: emptyStats(),
    conn_charge_cable: emptyStats(),
    fast_charger_brand: emptyStats(),
    fast_charger_type: emptyStats(),
    battery_heater_on: emptyStats(),
    battery_heater: emptyStats(),
  };

  const lastTick = ticks.at(-1) ?? null;
  const lastTickValues: ChargerTickValues = {
    charger_voltage: lastTick?.charger_voltage ?? null,
    charger_phases: lastTick?.charger_phases ?? null,
    charger_actual_current: lastTick?.charger_actual_current ?? null,
    charger_pilot_current: lastTick?.charger_pilot_current ?? null,
    charger_power: lastTick?.charger_power ?? null,
    conn_charge_cable: lastTick?.conn_charge_cable ?? null,
    fast_charger_brand: lastTick?.fast_charger_brand ?? null,
    fast_charger_type: lastTick?.fast_charger_type ?? null,
    battery_heater_on: lastTick?.battery_heater_on ?? null,
    battery_heater: lastTick?.battery_heater ?? null,
  };

  for (const field of CHARGER_TICK_FIELDS) {
    const seen = new Set<string>();
    let min: number | null = null;
    let max: number | null = null;
    for (const tk of ticks) {
      const v = (tk as Record<string, unknown>)[field] as
        | number
        | string
        | boolean
        | null
        | undefined;
      const key = v == null ? "null" : String(v);
      seen.add(key);
      if (NUMERIC_CHARGER_FIELDS.has(field) && typeof v === "number") {
        if (min == null || v < min) min = v;
        if (max == null || v > max) max = v;
      }
    }
    const distinct = Array.from(seen).sort().slice(0, 10);
    stats[field] = {
      uniform: distinct.length <= 1,
      distinct,
      ...(NUMERIC_CHARGER_FIELDS.has(field) && min != null && max != null
        ? { min, max }
        : {}),
    };
  }

  return { lastTickValues, stats, ticksCount: ticks.length };
}

// ---------------------------------------------------------------------------
// Suggestions d'autocomplete pour les 3 champs texte de la section Borne
// (conn_charge_cable, fast_charger_brand, fast_charger_type). On lit toute la
// base — pas de scope car_id — pour exposer le plus large vocabulaire,
// segmenté par AC vs DC selon `fast_charger_present`. Liste tronquée à 20
// par champ pour éviter un datalist obèse.
// ---------------------------------------------------------------------------

export type TickTextFieldSuggestions = {
  conn_charge_cable: string[];
  fast_charger_brand: string[];
  fast_charger_type: string[];
};

export type TickFieldSuggestionsByType = {
  AC: TickTextFieldSuggestions;
  DC: TickTextFieldSuggestions;
};

const SUGGESTIONS_LIMIT = 20;

function emptySuggestions(): TickTextFieldSuggestions {
  return { conn_charge_cable: [], fast_charger_brand: [], fast_charger_type: [] };
}

export async function deriveTickFieldSuggestions(): Promise<TickFieldSuggestionsByType> {
  const rows = await prisma.charges.findMany({
    distinct: [
      "fast_charger_present",
      "conn_charge_cable",
      "fast_charger_brand",
      "fast_charger_type",
    ],
    select: {
      fast_charger_present: true,
      conn_charge_cable: true,
      fast_charger_brand: true,
      fast_charger_type: true,
    },
  });

  const bucket: Record<"AC" | "DC", Record<keyof TickTextFieldSuggestions, Set<string>>> = {
    AC: {
      conn_charge_cable: new Set(),
      fast_charger_brand: new Set(),
      fast_charger_type: new Set(),
    },
    DC: {
      conn_charge_cable: new Set(),
      fast_charger_brand: new Set(),
      fast_charger_type: new Set(),
    },
  };

  for (const r of rows) {
    if (r.fast_charger_present !== true && r.fast_charger_present !== false) continue;
    const key: "AC" | "DC" = r.fast_charger_present ? "DC" : "AC";
    if (r.conn_charge_cable) bucket[key].conn_charge_cable.add(r.conn_charge_cable);
    if (r.fast_charger_brand) bucket[key].fast_charger_brand.add(r.fast_charger_brand);
    if (r.fast_charger_type) bucket[key].fast_charger_type.add(r.fast_charger_type);
  }

  const finalize = (s: Set<string>) =>
    Array.from(s).sort().slice(0, SUGGESTIONS_LIMIT);

  const out: TickFieldSuggestionsByType = {
    AC: emptySuggestions(),
    DC: emptySuggestions(),
  };
  for (const key of ["AC", "DC"] as const) {
    out[key].conn_charge_cable = finalize(bucket[key].conn_charge_cable);
    out[key].fast_charger_brand = finalize(bucket[key].fast_charger_brand);
    out[key].fast_charger_type = finalize(bucket[key].fast_charger_type);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Propagation des bornes start_date / end_date d'une session aux ticks de
// bord. Invariant métier : toute session contient ≥ 2 ticks ; si elle n'en
// avait qu'un, on en crée un second à end_date (clone du tick existant avec
// quelques surcharges) pour aligner firstTick.date = start_date et
// lastTick.date = end_date.
// ---------------------------------------------------------------------------

/**
 * Surcharges optionnelles appliquées au tick *cloné* (cas mono-tick) pour
 * refléter l'état "fin de session" : SOC, énergie cumulée, ranges. Les valeurs
 * laissées à `undefined` sont reprises du tick d'origine.
 */
export type BoundDatesEndOverrides = {
  end_battery_level?: number | null;
  end_charge_energy_added?: Prisma.Decimal | number | null;
  end_ideal_battery_range_km?: Prisma.Decimal | number | null;
  end_rated_battery_range_km?: Prisma.Decimal | number | null;
};

export type PropagateBoundDatesResult = {
  ticksAdjusted: number;
  ticksCreated: number;
};

function toDecimalOrUndefined(
  v: Prisma.Decimal | number | null | undefined,
): Prisma.Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
}

export async function propagateBoundDatesToTicks(
  tx: Prisma.TransactionClient,
  processId: number,
  startDate: Date,
  endDate: Date | null,
  endOverrides: BoundDatesEndOverrides = {},
): Promise<PropagateBoundDatesResult> {
  const ticks = await tx.charges.findMany({
    where: { charging_process_id: processId },
    orderBy: { date: "asc" },
    select: { id: true, date: true },
  });
  if (ticks.length === 0) {
    return { ticksAdjusted: 0, ticksCreated: 0 };
  }

  if (ticks.length === 1) {
    const lone = ticks[0];
    const target = endDate ?? startDate;
    // Tick existant : aligné sur start_date.
    if (lone.date.getTime() !== startDate.getTime()) {
      await tx.charges.update({
        where: { id: lone.id },
        data: { date: startDate },
      });
    }
    // Clone "fin" : on relit le tick complet pour cloner toutes ses colonnes
    // (charger_*, fast_charger_*, conn_*, battery_*, ranges, températures…).
    const full = await tx.charges.findUnique({ where: { id: lone.id } });
    if (!full) {
      // Ne devrait jamais arriver : le tick a été lu juste avant.
      return { ticksAdjusted: 1, ticksCreated: 0 };
    }
    const cloned: Prisma.chargesUncheckedCreateInput = {
      ...(full as unknown as Prisma.chargesUncheckedCreateInput),
      // Force la création d'une nouvelle ligne.
      id: undefined as unknown as number,
      date: target,
    };
    if (endOverrides.end_battery_level !== undefined) {
      cloned.battery_level = endOverrides.end_battery_level;
      cloned.usable_battery_level = endOverrides.end_battery_level;
    }
    if (endOverrides.end_charge_energy_added !== undefined) {
      const dec = toDecimalOrUndefined(endOverrides.end_charge_energy_added);
      // charge_energy_added est NOT NULL : on retombe sur 0 si null demandé.
      cloned.charge_energy_added = dec ?? new Prisma.Decimal(0);
    }
    if (endOverrides.end_ideal_battery_range_km !== undefined) {
      cloned.ideal_battery_range_km =
        toDecimalOrUndefined(endOverrides.end_ideal_battery_range_km) ??
        new Prisma.Decimal(0);
    }
    if (endOverrides.end_rated_battery_range_km !== undefined) {
      cloned.rated_battery_range_km = toDecimalOrUndefined(
        endOverrides.end_rated_battery_range_km,
      );
    }
    await tx.charges.create({ data: cloned });
    return { ticksAdjusted: 1, ticksCreated: 1 };
  }

  // ticks.length >= 2 : on n'aligne que les bornes si elles ont bougé.
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  let adjusted = 0;
  if (first.date.getTime() !== startDate.getTime()) {
    await tx.charges.update({ where: { id: first.id }, data: { date: startDate } });
    adjusted++;
  }
  if (endDate != null && last.date.getTime() !== endDate.getTime()) {
    await tx.charges.update({ where: { id: last.id }, data: { date: endDate } });
    adjusted++;
  }
  return { ticksAdjusted: adjusted, ticksCreated: 0 };
}

export async function applyRecalc(
  processId: number,
  recalc: Partial<ProcessRecalc>,
): Promise<void> {
  const data: Prisma.charging_processesUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(recalc, "start_date")) {
    data.start_date = recalc.start_date ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "end_date")) {
    data.end_date = recalc.end_date;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "duration_min")) {
    data.duration_min = recalc.duration_min;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "charge_energy_added")) {
    data.charge_energy_added =
      recalc.charge_energy_added == null
        ? null
        : new Prisma.Decimal(recalc.charge_energy_added);
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "start_battery_level")) {
    data.start_battery_level = recalc.start_battery_level;
  }
  if (Object.prototype.hasOwnProperty.call(recalc, "end_battery_level")) {
    data.end_battery_level = recalc.end_battery_level;
  }
  await prisma.charging_processes.update({ where: { id: processId }, data });
}
