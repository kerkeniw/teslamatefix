"use server";

import { requireSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  geocodeSearch,
  candidateLabel,
  candidateToAddressValues,
  GeoError,
} from "@/lib/geo/geocode";
import type { GeoSuggestion } from "@/lib/geo/types";

export type GeocodeResult =
  | { ok: true; suggestions: GeoSuggestion[] }
  | { ok: false; error: string; code: GeoError["code"] };

/**
 * Autocomplétion d'adresses géocodées (Nominatim). Renvoie des suggestions déjà
 * mappées vers l'entité `addresses` — le client n'importe donc jamais la couche
 * géo serveur. Utilisée par `AddressGeoCombobox` et `AddressCreateDialog`.
 */
export async function geocodeAddressAction(query: string): Promise<GeocodeResult> {
  await requireSession();
  try {
    const candidates = await geocodeSearch(query, { limit: 8 });
    const suggestions: GeoSuggestion[] = candidates.map((c) => ({
      key: `${c.osm_type}:${c.osm_id}`,
      label: candidateLabel(c),
      lat: c.lat,
      lon: c.lon,
      values: candidateToAddressValues(c),
    }));
    return { ok: true, suggestions };
  } catch (e) {
    if (e instanceof GeoError) {
      return { ok: false, error: e.message, code: e.code };
    }
    logger.error({ event: "geocode.action.error", err: String(e) }, "geocode failed");
    return { ok: false, error: "Erreur de géocodage.", code: "network" };
  }
}
