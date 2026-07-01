import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getTeslaAccessToken } from "./token";
import { fetchVehicleOptions, extractCodes } from "./fleet";

/**
 * Construit l'URL de la photo officielle Tesla (compositor) pour le véhicule
 * sélectionné, à partir de ses codes option.
 *
 * Source des codes (par ordre de priorité) :
 *   1. cache (mémoire + fichier JSON dans le volume persistant) — on met en cache
 *      l'ENSEMBLE du payload renvoyé par l'API, et on en (re)dérive les codes ;
 *   2. Fleet API `dx/vehicles/options` avec le token de TeslaMate (prod, token frais)
 *      → seule source des codes EXACTS de la voiture ; le payload complet est caché ;
 *   3. repli `TESLA_VEHICLE_OPTIONS` (env) quand l'API est inaccessible (pas de
 *      token / clé KO / 4xx / timeout) ;
 *   4. sinon : aucune image (`null`).
 *
 * Aucun code option n'est codé en dur : l'image ne s'affiche que si l'API ou l'env
 * fournit des codes.
 *
 * Itération v0.5.2 : une seule vue (`FRONT34`). Le slider multi-vues viendra ensuite.
 */

const COMPOSITOR_BASE = "https://static-assets.tesla.com/configurator/compositor";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const CACHE_FILE = path.join(env.SECRETS_DIR, "vehicle-options.json");

/**
 * Vues demandées au compositor, dans l'ordre du slider. Certaines vues (ex.
 * `INTERIOR_ROW2`) ne rendent que si le jeu d'options les supporte ; le slider
 * ignore côté client toute vue qui échoue au chargement (`<img onError>`).
 */
export const VEHICLE_VIEWS = [
  "FRONT34",
  "SIDE",
  "REAR34",
  "RIMCLOSEUP",
  "STUD_SEAT",
  "INTERIOR_ROW2",
] as const;

// On met en cache l'ensemble du retour API (payload brut) + l'horodatage.
type CacheEntry = { payload: unknown; fetchedAt: number };
type CacheShape = Record<string, CacheEntry>;

// Couche mémoire (process-local) au-dessus du fichier.
const memoryCache = new Map<string, CacheEntry>();

function readFileCache(): CacheShape {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    return JSON.parse(raw) as CacheShape;
  } catch {
    return {};
  }
}

function writeFileCache(vin: string, entry: CacheEntry): void {
  try {
    const current = readFileCache();
    current[vin] = entry;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(current), "utf8");
  } catch (err) {
    // Volume en lecture seule ou indisponible : on garde au moins le cache
    // mémoire, ce n'est pas bloquant.
    logger.warn(
      { event: "tesla.image.cache_write_error", err: (err as Error).message },
      "Impossible d'écrire le cache du payload options",
    );
  }
}

/**
 * Payload API en cache si frais (TTL). Les anciennes entrées d'un format antérieur
 * (sans `payload`) donnent `extractCodes(undefined) === []` côté appelant → le cache
 * est simplement régénéré.
 */
function getCachedPayload(vin: string): unknown | null {
  const now = Date.now();
  const fromMemory = memoryCache.get(vin);
  if (fromMemory && now - fromMemory.fetchedAt < CACHE_TTL_MS) {
    return fromMemory.payload;
  }
  const entry = readFileCache()[vin];
  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) {
    memoryCache.set(vin, entry);
    return entry.payload;
  }
  return null;
}

function cachePayload(vin: string, payload: unknown): void {
  const entry: CacheEntry = { payload, fetchedAt: Date.now() };
  memoryCache.set(vin, entry);
  writeFileCache(vin, entry);
}

/**
 * Lit l'entrée de cache (mémoire ou fichier) pour un VIN **sans filtre TTL** —
 * destiné à l'affichage (onglet Options de `/cars/{id}`). Retourne le payload API
 * brut, les codes extraits et l'horodatage ISO, ou `null` si rien en cache.
 */
export function readCachedVehicleOptions(
  vin: string | null,
): { codes: string[]; payload: unknown; fetchedAt: string } | null {
  if (!vin) return null;
  const entry = memoryCache.get(vin) ?? readFileCache()[vin];
  if (!entry) return null;
  return {
    codes: extractCodes(entry.payload),
    payload: entry.payload,
    fetchedAt: new Date(entry.fetchedAt).toISOString(),
  };
}

/** Override manuel optionnel (`TESLA_VEHICLE_OPTIONS`). `null` si non défini. */
function envOverrideCodes(): string[] | null {
  const fromEnv = env.TESLA_VEHICLE_OPTIONS;
  if (!fromEnv) return null;
  const parsed = fromEnv
    .split(",")
    .map((c) => c.trim().replace(/^\$+/, ""))
    .filter(Boolean);
  return parsed.length > 0 ? parsed : null;
}

/** Mappe le `model` TeslaMate (S/3/X/Y) vers le code compositor (ms/m3/mx/my). */
function compositorModel(model: string | null): string {
  switch ((model ?? "").trim().toUpperCase()) {
    case "S":
      return "ms";
    case "3":
      return "m3";
    case "X":
      return "mx";
    case "Y":
      return "my";
    default:
      return "my"; // repli raisonnable (le plus courant)
  }
}

function buildCompositorUrl(
  codes: string[],
  model: string | null,
  view: string,
): string {
  const options = codes.map((c) => `$${c}`).join(",");
  const params = new URLSearchParams({
    context: "design_studio_2",
    options,
    view,
    model: compositorModel(model),
    size: "1920",
    bkba_opt: "2",
    crop: "0,0,0,0",
    overlay: "0",
  });
  return `${COMPOSITOR_BASE}?${params.toString()}`;
}

/** Construit une vue par entrée de `VEHICLE_VIEWS` à partir d'un jeu de codes. */
function buildViews(codes: string[], model: string | null): VehicleImageView[] {
  return VEHICLE_VIEWS.map((view) => ({
    view,
    url: buildCompositorUrl(codes, model, view),
  }));
}

/** Origine des codes ayant servi à générer l'image. */
export type VehicleImageSource = "api" | "env";

export type VehicleImageView = { view: string; url: string };

/** Jeu d'images (une URL par vue) + origine des codes. */
export type VehicleImageSet = {
  views: VehicleImageView[];
  source: VehicleImageSource;
};

/**
 * Résout les images du véhicule (une par vue de `VEHICLE_VIEWS`) et **d'où**
 * viennent les codes. Ne lève jamais. Retourne `null` s'il n'y a ni VIN ni codes
 * exploitables (API inaccessible ET `TESLA_VEHICLE_OPTIONS` vide).
 *   - `source: "api"` : cache du payload API **ou** appel Fleet direct ;
 *   - `source: "env"` : repli sur `TESLA_VEHICLE_OPTIONS`.
 */
export async function getVehicleImages({
  vin,
  model,
}: {
  vin: string | null;
  model: string | null;
}): Promise<VehicleImageSet | null> {
  if (!vin) return null;

  // 1. Cache : payload API mémorisé → on en (re)dérive les codes.
  const cachedCodes = extractCodes(getCachedPayload(vin));
  if (cachedCodes.length > 0) {
    return { views: buildViews(cachedCodes, model), source: "api" };
  }

  // 2. Fleet API (token TeslaMate) — codes EXACTS ; on cache le payload complet.
  const token = await getTeslaAccessToken();
  if (token) {
    const payload = await fetchVehicleOptions(vin, token);
    const codes = extractCodes(payload);
    if (codes.length > 0) {
      cachePayload(vin, payload);
      return { views: buildViews(codes, model), source: "api" };
    }
  }

  // 3. Repli env `TESLA_VEHICLE_OPTIONS` (API inaccessible). Non mis en cache :
  //    la Fleet API doit reprendre la main dès qu'un token redevient valide.
  const override = envOverrideCodes();
  if (override) {
    return { views: buildViews(override, model), source: "env" };
  }

  // 4. Rien d'exploitable → pas d'image.
  return null;
}
