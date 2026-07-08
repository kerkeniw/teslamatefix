/**
 * Détermine si un point GPS tombe dans une géofence existante (rayon en mètres).
 * Réutilise `haversineKm` du recalcul de trajets. Retourne la géofence la plus
 * proche parmi celles qui contiennent le point, sous forme de `FKOption`.
 */
import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/integrity/drives";
import type { FKOption } from "@/components/form/fk-combobox";

export async function findContainingGeofence(
  lat: number,
  lon: number,
): Promise<FKOption | null> {
  const geofences = await prisma.geofences.findMany({
    select: { id: true, name: true, latitude: true, longitude: true, radius: true },
  });

  let best: { id: number; name: string; distM: number } | null = null;
  for (const g of geofences) {
    const distM =
      haversineKm(lat, lon, Number(g.latitude), Number(g.longitude)) * 1000;
    if (distM <= g.radius && (best === null || distM < best.distM)) {
      best = { id: g.id, name: g.name, distM };
    }
  }

  return best ? { id: best.id, label: best.name } : null;
}
