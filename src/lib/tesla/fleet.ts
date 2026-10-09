import { env } from "@/lib/env";
import { warnThrottled } from "@/lib/logger";

const FETCH_TIMEOUT_MS = 3_000;

/** Cause probable d'une erreur HTTP de la Fleet API, pour un journal lisible. */
function httpHint(status: number): string {
  if (status === 401) return "jeton refusé (expiré ou révoqué) : TeslaMate doit le rafraîchir";
  if (status === 403) return "accès refusé : scope manquant ou application non enregistrée dans la région";
  if (status === 404) return "véhicule inconnu pour ce compte (VIN) ou mauvaise région Fleet API";
  if (status === 412) return "application non enregistrée (partner registration) dans cette région";
  if (status === 429) return "quota d'appels Fleet API dépassé";
  if (status >= 500) return "indisponibilité côté Tesla";
  return "réponse inattendue";
}

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
      // Corps d'erreur Tesla (JSON court, sans secret) : utile au diagnostic.
      const body = (await res.text().catch(() => "")).slice(0, 300);
      warnThrottled(
        `tesla.fleet.options.http_${res.status}`,
        {
          event: "tesla.fleet.options.http_error",
          status: res.status,
          endpoint: "GET /api/1/dx/vehicles/options",
          base_url: env.TESLA_FLEET_API_BASE_URL,
          body,
        },
        `Fleet API dx/vehicles/options : HTTP ${res.status} — ${httpHint(res.status)}`,
      );
      return null;
    }

    return await res.json();
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    warnThrottled(
      "tesla.fleet.options.fetch_error",
      {
        event: "tesla.fleet.options.fetch_error",
        endpoint: "GET /api/1/dx/vehicles/options",
        base_url: env.TESLA_FLEET_API_BASE_URL,
        err: aborted ? `timeout ${FETCH_TIMEOUT_MS} ms` : (err as Error).message,
      },
      "Échec de l'appel Fleet API dx/vehicles/options (réseau ou délai dépassé)",
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
