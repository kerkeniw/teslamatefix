import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const FETCH_TIMEOUT_MS = 3_000;

/**
 * Normalise un code option vers la forme attendue par le compositor, SANS le
 * préfixe `$` (le builder d'URL le rajoute). Tesla renvoie tantôt `"$MTY68"`,
 * tantôt `"MTY68"` selon les endpoints/versions.
 */
function normalizeCode(raw: string): string {
  return raw.trim().replace(/^\$+/, "");
}

/**
 * Extrait la liste des codes option depuis la réponse de `dx/vehicles/options`.
 * Le shape n'est pas garanti stable côté Tesla — on gère :
 *   - `{ codes: "$A,$B" }`              (CSV)
 *   - `{ codes: ["$A", "$B"] }`         (tableau de strings)
 *   - `{ codes: [{ code: "$A" }, ...] }`(tableau d'objets)
 *   - mêmes formes sous une clé `data`.
 *
 * Exporté : utilisé aussi bien sur un payload fraîchement récupéré que sur un
 * payload servi depuis le cache (`vehicle-image.ts`).
 */
export function extractCodes(payload: unknown): string[] {
  const root = (payload as { response?: unknown })?.response ?? payload;
  const codes =
    (root as { codes?: unknown })?.codes ?? (root as { data?: unknown })?.data;

  if (typeof codes === "string") {
    return codes
      .split(",")
      .map(normalizeCode)
      .filter(Boolean);
  }
  if (Array.isArray(codes)) {
    return codes
      .map((c) =>
        typeof c === "string"
          ? c
          : typeof (c as { code?: unknown })?.code === "string"
            ? (c as { code: string }).code
            : "",
      )
      .map(normalizeCode)
      .filter(Boolean);
  }
  return [];
}

/**
 * Appelle `GET /api/1/dx/vehicles/options?vin={vin}` sur la Fleet API et renvoie
 * le **payload JSON brut** (mis en cache tel quel par l'appelant). Retourne `null`
 * sur 401/403, timeout ou erreur réseau — l'appelant retombe alors sur l'env.
 * L'extraction/validation des codes est laissée au caller (`extractCodes`).
 */
export async function fetchVehicleOptions(
  vin: string,
  token: string,
): Promise<unknown | null> {
  const url = `${env.TESLA_FLEET_API_BASE_URL}/api/1/dx/vehicles/options?vin=${encodeURIComponent(vin)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      logger.warn(
        { event: "tesla.fleet.options.http_error", status: res.status },
        "Fleet API dx/vehicles/options a renvoyé une erreur",
      );
      return null;
    }

    return await res.json();
  } catch (err) {
    logger.warn(
      { event: "tesla.fleet.options.fetch_error", err: (err as Error).message },
      "Échec de l'appel Fleet API dx/vehicles/options",
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
