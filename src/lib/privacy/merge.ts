import type { TeslaChargeSession } from "./charging-csv";

/** Fusion des imports Privacy successifs (pure, testée). Persistance : `store.ts`. */

export type PrivacyImportEntry = {
  importedAt: string;
  fileName: string;
  sessions: number;
  added: number;
  from: string;
  to: string;
};

export type PrivacyStore = {
  version: 1;
  sessions: TeslaChargeSession[];
  imports: PrivacyImportEntry[];
};

export const EMPTY_STORE: PrivacyStore = { version: 1, sessions: [], imports: [] };

const keyOf = (s: TeslaChargeSession) => `${s.vin}|${s.start}`;

/** Fusionne un import dans le store (pure). Une session déjà connue est remplacée. */
export function mergeImport(
  store: PrivacyStore,
  incoming: TeslaChargeSession[],
  fileName: string,
  now: Date = new Date(),
): { store: PrivacyStore; entry: PrivacyImportEntry } {
  const byKey = new Map(store.sessions.map((s) => [keyOf(s), s]));
  let added = 0;
  for (const s of incoming) {
    if (!byKey.has(keyOf(s))) added++;
    byKey.set(keyOf(s), s);
  }
  const sessions = [...byKey.values()].sort((a, b) => a.start.localeCompare(b.start));
  const starts = incoming.map((s) => s.start).sort();
  const ends = incoming.map((s) => s.end).sort();
  const entry: PrivacyImportEntry = {
    importedAt: now.toISOString(),
    fileName,
    sessions: incoming.length,
    added,
    from: starts[0] ?? "",
    to: ends[ends.length - 1] ?? "",
  };
  return { store: { version: 1, sessions, imports: [...store.imports, entry] }, entry };
}
