import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE_NAME = "tmfix_car_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 an

/**
 * Lit l'ID du véhicule sélectionné depuis le cookie httpOnly `tmfix_car_id`.
 * Retourne `null` si pas de cookie, si la valeur est invalide, ou si le
 * véhicule a été supprimé entretemps. Toutes les pages d'entité filtrées
 * par véhicule (drives, charges, positions, states, updates) appellent ce
 * helper en SSR.
 */
export async function getSelectedCarId(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type CarOption = {
  id: number;
  label: string;
  vinShort: string | null;
};

function carLabel(c: {
  name: string | null;
  marketing_name: string | null;
  model: string | null;
  vin: string | null;
  id: number;
}): string {
  return c.name ?? c.marketing_name ?? c.model ?? c.vin ?? `#${c.id}`;
}

/**
 * Liste tous les véhicules connus (utilisée par le picker du header).
 * Triée par display_priority asc puis id asc — premier véhicule = défaut implicite.
 */
export async function listCars(): Promise<CarOption[]> {
  const cars = await prisma.cars.findMany({
    select: {
      id: true,
      name: true,
      marketing_name: true,
      model: true,
      vin: true,
      display_priority: true,
    },
    orderBy: [{ display_priority: "asc" }, { id: "asc" }],
  });
  return cars.map((c) => ({
    id: c.id,
    label: carLabel(c),
    vinShort: c.vin ? c.vin.slice(-6) : null,
  }));
}

/**
 * Résout le véhicule "actif" : cookie sélectionné si présent et valide,
 * sinon le premier de la liste (auto-sélection quand il n'y a qu'un seul
 * véhicule, comportement attendu par défaut).
 *
 * Retourne `null` si aucun véhicule en base — le caller doit alors afficher
 * un message d'onboarding et ne pas tenter de filtrer ses requêtes.
 */
export async function getSelectedCarOrDefault(): Promise<CarOption | null> {
  const cars = await listCars();
  if (cars.length === 0) return null;
  const selectedId = await getSelectedCarId();
  if (selectedId != null) {
    const match = cars.find((c) => c.id === selectedId);
    if (match) return match;
  }
  return cars[0];
}

export const VEHICLE_COOKIE = {
  name: COOKIE_NAME,
  maxAge: COOKIE_MAX_AGE,
} as const;
