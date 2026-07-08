"use server";

import { requireSession } from "@/lib/auth";
import { findContainingGeofence } from "@/lib/geo/geofence";
import type { FKOption } from "@/components/form/fk-combobox";

/**
 * Renvoie la géofence contenant le point (lat, lon), ou null. Utilisée pour
 * auto-sélectionner la géofence départ/arrivée après choix d'une adresse.
 */
export async function findGeofenceForPointAction(
  lat: number,
  lon: number,
): Promise<FKOption | null> {
  await requireSession();
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return findContainingGeofence(lat, lon);
}
