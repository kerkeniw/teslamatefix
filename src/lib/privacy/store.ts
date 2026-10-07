import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { EMPTY_STORE, type PrivacyStore } from "./merge";

export { EMPTY_STORE, mergeImport, type PrivacyStore, type PrivacyImportEntry } from "./merge";

/**
 * Persistance des sessions issues des exports Privacy Tesla, dans le volume
 * `/data` (comme le cache du compositor). Les imports successifs se cumulent :
 * Tesla livre un export par période demandée, on fusionne en dédoublonnant sur
 * (VIN, début). Le rapport est recalculé à chaque affichage contre la base, il
 * n'est donc pas stocké.
 */

const STORE_FILE = path.join(env.SECRETS_DIR, "privacy-charging.json");

export function readPrivacyStore(): PrivacyStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as PrivacyStore;
    return parsed?.version === 1 && Array.isArray(parsed.sessions) ? parsed : EMPTY_STORE;
  } catch {
    return EMPTY_STORE;
  }
}

/** Écriture atomique (fichier temporaire + rename). Lève si le volume est en lecture seule. */
export function writePrivacyStore(store: PrivacyStore): void {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store), "utf8");
  fs.renameSync(tmp, STORE_FILE);
}

export function clearPrivacyStore(): void {
  fs.rmSync(STORE_FILE, { force: true });
}
