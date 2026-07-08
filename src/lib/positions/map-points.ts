/**
 * Points de la carte Positions — helpers partagés client/serveur.
 *
 * Les points sont chargés en AJAX par lots (cf. `map-actions.ts`) puis accumulés
 * côté client. Le regroupement par trajet et le sous-échantillonnage (décimation)
 * se font donc **côté client**, au rendu de la carte — ces helpers sont purs.
 *
 * `serializeMapPoint` est utilisé côté serveur par l'action de batch (import du
 * type `Prisma.Decimal` uniquement).
 */

import type { Prisma } from "@prisma/client";

/** Taille d'un lot AJAX. */
export const BATCH_SIZE = 2000;

/** Plafond de points chargés avant pause (« charger plus » pour continuer). */
export const SAFETY_CAP = 60_000;

/** Points conservés au maximum par trajet après décimation (rendu). */
export const MAX_POINTS_PER_DRIVE = 400;

/** Points « hors trajet » conservés au maximum au total (rendu). */
export const MAX_LOOSE_POINTS = 600;

export type RawMapPoint = {
  id: number;
  date: Date;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  drive_id: number | null;
  speed: number | null;
  power: number | null;
};

export type MapPoint = {
  id: number;
  lat: number;
  lng: number;
  date: string;
  drive_id: number | null;
  speed: number | null;
  power: number | null;
};

export type MapTrack = {
  driveId: number;
  points: MapPoint[];
};

/**
 * Palette cyclée par trajet. La couleur est dérivée du `driveId` (modulo) et non
 * de l'ordre d'affichage : ainsi la carte et la liste de cases à cocher montrent
 * exactement la même couleur pour un trajet donné, quel que soit l'ordre de
 * chargement.
 */
export const TRACK_COLORS = [
  "#2563eb", // bleu
  "#dc2626", // rouge
  "#16a34a", // vert
  "#d97706", // ambre
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#db2777", // rose
  "#65a30d", // olive
];

export function driveColor(driveId: number): string {
  return TRACK_COLORS[((driveId % TRACK_COLORS.length) + TRACK_COLORS.length) % TRACK_COLORS.length];
}

/** Sérialise une ligne Prisma en point client (Decimal → number, Date → ISO). */
export function serializeMapPoint(p: RawMapPoint): MapPoint {
  return {
    id: p.id,
    lat: Number(p.latitude),
    lng: Number(p.longitude),
    date: p.date.toISOString(),
    drive_id: p.drive_id,
    speed: p.speed,
    power: p.power,
  };
}

/** Sous-échantillonne une liste ordonnée en gardant premier + dernier. */
export function subsampleTrack(points: MapPoint[], maxPoints: number): MapPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: MapPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1]?.id !== last.id) out.push(last);
  return out;
}

/**
 * Regroupe des points accumulés en trajets (triés par date) + points hors trajet.
 * Les lots arrivant ordonnés par `id` (pas forcément par date), on trie chaque
 * trajet par date pour un tracé cohérent.
 */
export function groupPoints(points: MapPoint[]): {
  drives: MapTrack[];
  loose: MapPoint[];
} {
  const byDrive = new Map<number, MapPoint[]>();
  const loose: MapPoint[] = [];
  for (const p of points) {
    if (p.drive_id == null) {
      loose.push(p);
    } else {
      const arr = byDrive.get(p.drive_id);
      if (arr) arr.push(p);
      else byDrive.set(p.drive_id, [p]);
    }
  }

  const drives: MapTrack[] = [];
  for (const [driveId, pts] of byDrive) {
    pts.sort((a, b) => a.date.localeCompare(b.date));
    drives.push({ driveId, points: pts });
  }
  // Trajets par id croissant → couleur stable quel que soit l'ordre d'arrivée.
  drives.sort((a, b) => a.driveId - b.driveId);
  loose.sort((a, b) => a.date.localeCompare(b.date));

  return { drives, loose };
}
