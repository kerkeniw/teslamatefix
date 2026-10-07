"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { ChargingCsvError, parseChargingCsv } from "@/lib/privacy/charging-csv";
import {
  clearPrivacyStore,
  mergeImport,
  readPrivacyStore,
  writePrivacyStore,
} from "@/lib/privacy/store";

export type PrivacyImportState = {
  ok: boolean;
  error?: string;
  sessions?: number;
  added?: number;
};

// Limite par défaut du body des server actions : 1 Mo. Un export de 3 mois
// fait ~15 Ko, on garde de la marge sans relever la limite.
const MAX_BYTES = 900 * 1024;

/**
 * Import de `Charging Data.csv` (export Privacy Tesla). N'écrit pas dans la base
 * TeslaMate (seulement dans le volume /data) : autorisé en READ_ONLY.
 */
export async function importChargingCsvAction(
  _prev: PrivacyImportState | null,
  formData: FormData,
): Promise<PrivacyImportState> {
  const session = await requireSession();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Aucun fichier sélectionné." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Fichier trop volumineux (900 Ko max)." };
  }

  let parsed;
  try {
    parsed = parseChargingCsv(await file.text());
  } catch (e) {
    if (e instanceof ChargingCsvError) return { ok: false, error: e.message };
    throw e;
  }
  if (parsed.length === 0) {
    return { ok: false, error: "Aucune session de charge dans ce fichier." };
  }

  const { store, entry } = mergeImport(readPrivacyStore(), parsed, file.name);
  try {
    writePrivacyStore(store);
  } catch (err) {
    logger.error(
      { event: "privacy.import.error", err: (err as Error).message },
      "Écriture du store Privacy impossible",
    );
    return {
      ok: false,
      error: "Impossible d'enregistrer l'import (volume /data en lecture seule ?).",
    };
  }

  // Pas de VIN ni de lieu dans les logs.
  logger.info(
    { event: "privacy.import", user: session.userId, sessions: entry.sessions, added: entry.added },
    "privacy.import",
  );
  revalidatePath("/privacy");
  revalidatePath("/");
  return { ok: true, sessions: entry.sessions, added: entry.added };
}

export async function clearPrivacyImportAction(): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  try {
    clearPrivacyStore();
  } catch (err) {
    logger.error({ event: "privacy.clear.error", err: (err as Error).message }, "privacy.clear");
    return { ok: false, error: "Suppression impossible." };
  }
  logger.info({ event: "privacy.clear", user: session.userId }, "privacy.clear");
  revalidatePath("/privacy");
  revalidatePath("/");
  return { ok: true };
}
