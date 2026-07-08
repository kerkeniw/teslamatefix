/**
 * Calcul d'itinéraire via OSRM. Renvoie la distance, la durée et la géométrie
 * (liste de points lat/lon) du meilleur trajet routier entre deux points.
 * Base URL configurable via `env.ROUTER_BASE_URL` (défaut = OSRM public).
 */
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { GeoError } from "@/lib/geo/geocode";

export type LatLon = { lat: number; lon: number };

export type RouteResult = {
  distanceKm: number;
  durationS: number;
  /** Géométrie décodée (GeoJSON), ordonnée départ → arrivée. */
  coordinates: LatLon[];
};

type OsrmResponse = {
  code?: string;
  routes?: Array<{
    distance?: number; // mètres
    duration?: number; // secondes
    geometry?: { coordinates?: [number, number][] }; // [lon, lat]
  }>;
};

const TIMEOUT_MS = 10000;

export async function routeBetween(from: LatLon, to: LatLon): Promise<RouteResult> {
  const base = env.ROUTER_BASE_URL.replace(/\/$/, "");
  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": env.GEO_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    logger.error({ event: "geo.route.fetch_error", err: String(e) }, "osrm fetch failed");
    throw new GeoError("Service de routage injoignable.", "network");
  }
  if (res.status === 429) {
    throw new GeoError("Quota du routeur atteint, réessayez plus tard.", "rate_limited");
  }
  if (!res.ok) {
    throw new GeoError(`Réponse routeur invalide (${res.status}).`, "bad_response");
  }

  let data: OsrmResponse;
  try {
    data = (await res.json()) as OsrmResponse;
  } catch {
    throw new GeoError("Réponse routeur illisible.", "bad_response");
  }

  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route || !route.geometry?.coordinates?.length) {
    throw new GeoError("Aucun itinéraire trouvé entre ces deux points.", "bad_response");
  }

  const coordinates: LatLon[] = route.geometry.coordinates.map(([lon, lat]) => ({
    lat,
    lon,
  }));

  return {
    distanceKm: (route.distance ?? 0) / 1000,
    durationS: route.duration ?? 0,
    coordinates,
  };
}
