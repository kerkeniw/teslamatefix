/**
 * Géocodage via Nominatim (compatible avec le géocodeur utilisé par TeslaMate
 * lui-même). Deux usages :
 *   - `geocodeSearch` : autocomplétion forward (texte → adresses candidates,
 *     avec numéros de rue grâce à `addressdetails=1`) ;
 *   - `reverseGeocode` : lat/lon → adresse la plus proche.
 *
 * Base URL et User-Agent sont configurables via `env` (cf. GEOCODER_BASE_URL /
 * GEO_USER_AGENT). L'instance publique OSM est soumise à une policy de quota.
 */
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { AddressFormValues } from "@/components/entities/addresses/AddressForm";

/** Erreur métier géo — permet au caller de distinguer quota / réseau / vide. */
export class GeoError extends Error {
  constructor(
    message: string,
    readonly code: "network" | "rate_limited" | "bad_response" = "network",
  ) {
    super(message);
    this.name = "GeoError";
  }
}

/** Sous-ensemble des composantes d'adresse renvoyées par Nominatim. */
export type NominatimAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  postcode?: string;
  state?: string;
  state_district?: string;
  country?: string;
};

export type GeoCandidate = {
  osm_id: number;
  osm_type: string;
  display_name: string;
  lat: number;
  lon: number;
  name: string | null;
  address: NominatimAddress;
  /** Payload Nominatim complet (stocké tel quel dans addresses.raw). */
  raw: Record<string, unknown>;
};

type NominatimResult = {
  place_id?: number;
  osm_id?: number;
  osm_type?: string;
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  address?: NominatimAddress;
  [k: string]: unknown;
};

const TIMEOUT_MS = 8000;

async function nominatimFetch(path: string): Promise<unknown> {
  const url = `${env.GEOCODER_BASE_URL.replace(/\/$/, "")}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": env.GEO_USER_AGENT,
        "Accept-Language": env.DEFAULT_LOCALE,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    logger.error({ event: "geo.geocode.fetch_error", err: String(e) }, "nominatim fetch failed");
    throw new GeoError("Service de géocodage injoignable.", "network");
  }
  if (res.status === 429) {
    throw new GeoError("Quota du géocodeur atteint, réessayez plus tard.", "rate_limited");
  }
  if (!res.ok) {
    throw new GeoError(`Réponse géocodeur invalide (${res.status}).`, "bad_response");
  }
  try {
    return await res.json();
  } catch {
    throw new GeoError("Réponse géocodeur illisible.", "bad_response");
  }
}

function toCandidate(r: NominatimResult): GeoCandidate | null {
  const lat = r.lat != null ? Number(r.lat) : NaN;
  const lon = r.lon != null ? Number(r.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (r.osm_id == null || r.osm_type == null) return null;
  return {
    osm_id: Number(r.osm_id),
    osm_type: r.osm_type,
    display_name: r.display_name ?? "",
    lat,
    lon,
    name: r.name && r.name.trim() !== "" ? r.name : null,
    address: r.address ?? {},
    raw: r as Record<string, unknown>,
  };
}

/**
 * Recherche forward. `addressdetails=1` fournit les composantes (dont le numéro
 * de rue). Sans query non vide, renvoie `[]` (le combobox n'appelle pas à vide).
 */
export async function geocodeSearch(
  query: string,
  opts: { limit?: number; countrycodes?: string } = {},
): Promise<GeoCandidate[]> {
  const q = query.trim();
  if (q === "") return [];
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: String(opts.limit ?? 8),
    q,
  });
  if (opts.countrycodes) params.set("countrycodes", opts.countrycodes);
  const data = await nominatimFetch(`/search?${params.toString()}`);
  if (!Array.isArray(data)) throw new GeoError("Réponse géocodeur inattendue.", "bad_response");
  return (data as NominatimResult[])
    .map(toCandidate)
    .filter((c): c is GeoCandidate => c !== null);
}

/** Reverse : lat/lon → adresse la plus proche (un seul candidat). */
export async function reverseGeocode(lat: number, lon: number): Promise<GeoCandidate | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    lat: String(lat),
    lon: String(lon),
  });
  const data = await nominatimFetch(`/reverse?${params.toString()}`);
  if (data == null || typeof data !== "object") return null;
  if ("error" in (data as Record<string, unknown>)) return null;
  return toCandidate(data as NominatimResult);
}

function city(a: NominatimAddress): string | null {
  return a.city ?? a.town ?? a.village ?? a.municipality ?? null;
}

/** Libellé court pour l'affichage dans le combobox (num rue, ville, pays). */
export function candidateLabel(c: GeoCandidate): string {
  const a = c.address;
  const line1 = [a.house_number, a.road ?? a.pedestrian].filter(Boolean).join(" ");
  const parts = [line1, city(a), a.country].filter((p) => p && p.trim() !== "");
  return parts.length > 0 ? parts.join(", ") : c.display_name;
}

/**
 * Mappe un candidat géocodé vers les champs de l'entité `addresses`. Le champ
 * `name` correspond au « Nom complet » côté dialog ; on privilégie le nom OSM,
 * sinon « n° rue » lisible, sinon le début du display_name.
 */
export function candidateToAddressValues(c: GeoCandidate): AddressFormValues {
  const a = c.address;
  const shortName =
    c.name ??
    ([a.house_number, a.road ?? a.pedestrian].filter(Boolean).join(" ") || null) ??
    (c.display_name ? c.display_name.split(",")[0] : null);
  return {
    display_name: c.display_name || null,
    name: shortName,
    house_number: a.house_number ?? null,
    road: a.road ?? a.pedestrian ?? null,
    neighbourhood: a.neighbourhood ?? a.suburb ?? null,
    city: city(a),
    county: a.county ?? null,
    postcode: a.postcode ?? null,
    state: a.state ?? null,
    state_district: a.state_district ?? null,
    country: a.country ?? null,
    latitude: String(c.lat),
    longitude: String(c.lon),
    osm_id: String(c.osm_id),
    osm_type: c.osm_type,
    raw: JSON.stringify(c.raw),
  };
}
