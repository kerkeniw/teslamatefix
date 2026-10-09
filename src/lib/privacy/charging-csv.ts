/**
 * Lecture de `Charging Data/Charging Data.csv` de l'export Privacy Tesla
 * (demande de données personnelles). Une ligne = une session vue par la voiture :
 *
 *   VIN,Charge Start Time (UTC),Charge End Time (UTC),Charge Duration (s),
 *   Energy Added (kWh),Charger Type,Location
 *
 * Pas de coût, de SOC ni d'énergie consommée. Fonctions pures (testées).
 */

export type TeslaChargeKind = "AC" | "DC";

export type TeslaChargeSession = {
  vin: string;
  /** ISO UTC */
  start: string;
  /** ISO UTC */
  end: string;
  durationS: number;
  energyAddedKwh: number;
  /** Libellé brut Tesla (« Europe Supercharger », « General - AC power »…) */
  chargerType: string;
  kind: TeslaChargeKind;
  /** « Home », « Away », « Favorites »… */
  location: string;
};

export class ChargingCsvError extends Error {
  readonly code: "empty" | "headers" | "row";
  constructor(code: "empty" | "headers" | "row", message: string) {
    super(message);
    this.name = "ChargingCsvError";
    this.code = code;
  }
}

const COLUMNS = {
  vin: "VIN",
  start: "Charge Start Time (UTC)",
  end: "Charge End Time (UTC)",
  duration: "Charge Duration (s)",
  energy: "Energy Added (kWh)",
  chargerType: "Charger Type",
  location: "Location",
} as const;

/** Parseur CSV RFC 4180 minimal : guillemets, `""` échappé, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** DC : Supercharger, CCS, CHAdeMO, « DC » explicite. Tout le reste est AC. */
export function chargerKind(chargerType: string): TeslaChargeKind {
  return /supercharger|ccs|combo|chademo|\bdc\b/i.test(chargerType) ? "DC" : "AC";
}

/** « 2026-06-11 22:05:41 » (UTC, sans fuseau) → ISO UTC. */
function utcToIso(v: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${m[3] ?? ""}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseChargingCsv(text: string): TeslaChargeSession[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new ChargingCsvError("empty", "Fichier vide.");

  const header = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, label]) => [k, header.indexOf(label)]),
  ) as Record<keyof typeof COLUMNS, number>;
  const missing = Object.entries(idx)
    .filter(([, i]) => i < 0)
    .map(([k]) => COLUMNS[k as keyof typeof COLUMNS]);
  if (missing.length > 0) {
    throw new ChargingCsvError(
      "headers",
      `Colonnes manquantes : ${missing.join(", ")}. Attendu : « Charging Data.csv » de l'export Tesla.`,
    );
  }

  const sessions: TeslaChargeSession[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const start = utcToIso(r[idx.start] ?? "");
    const end = utcToIso(r[idx.end] ?? "");
    const energy = Number((r[idx.energy] ?? "").trim());
    const duration = Number((r[idx.duration] ?? "").trim());
    const vin = (r[idx.vin] ?? "").trim();
    if (!vin || !start || !end || !Number.isFinite(energy)) {
      throw new ChargingCsvError("row", `Ligne ${line} invalide.`);
    }
    const chargerType = (r[idx.chargerType] ?? "").trim();
    sessions.push({
      vin,
      start,
      end,
      durationS: Number.isFinite(duration)
        ? duration
        : Math.round((Date.parse(end) - Date.parse(start)) / 1000),
      energyAddedKwh: energy,
      chargerType,
      kind: chargerKind(chargerType),
      location: (r[idx.location] ?? "").trim(),
    });
  });
  return sessions;
}
