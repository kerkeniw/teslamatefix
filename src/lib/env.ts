/**
 * Validation des variables d'environnement au démarrage.
 *
 * Auth — modèle "zero-config" (depuis v0.2.0) :
 *   - L'entrypoint Docker (`docker/entrypoint.sh`) bootstrappe AUTH_SECRET,
 *     AUTH_USERNAME et AUTH_PASSWORD_HASH dans `/data` au premier démarrage,
 *     puis les exporte dans l'env avant de lancer node.
 *   - `env.AUTH_SECRET` reste exposé ici (utilisé pour la config iron-session).
 *   - AUTH_USERNAME et AUTH_PASSWORD_HASH ne sont **plus** dans cet objet :
 *     ils sont lus à chaud via les helpers `getCurrentUsername()` et
 *     `getCurrentPasswordHash()` (cf. `lib/auth.ts`) pour permettre la
 *     rotation à chaud après changement de mot de passe.
 *
 * En dev local : si AUTH_SECRET n'est pas en env, on tente de le lire depuis
 * `TMFIX_SECRETS_DIR/auth_secret` (par défaut `/data/auth_secret`).
 */

import fs from "node:fs";

const SECRETS_DIR = process.env.TMFIX_SECRETS_DIR ?? "/data";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `[teslamatefix] Variable d'environnement manquante : ${name}. ` +
        `Voir .env.example pour la liste complète.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

/**
 * Lit AUTH_SECRET dans l'env, sinon depuis le filesystem (entrypoint Docker
 * l'aura déposé là au premier démarrage). En cas d'absence totale, lance une
 * erreur explicite avec les options de récupération.
 */
function loadAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv;

  const file = `${SECRETS_DIR}/auth_secret`;
  if (fs.existsSync(file)) {
    const fromFile = fs.readFileSync(file, "utf8").trim();
    if (fromFile) {
      // Propager vers process.env pour que le proxy (qui ne passe pas par
      // ce module) puisse le récupérer via process.env.AUTH_SECRET.
      process.env.AUTH_SECRET = fromFile;
      return fromFile;
    }
  }

  throw new Error(
    `[teslamatefix] AUTH_SECRET manquant — ni en env, ni dans ${file}. ` +
      `Le container Docker bootstrappe ce secret automatiquement. En dev ` +
      `local, générer : openssl rand -base64 32 > ${file}`,
  );
}

const AUTH_SECRET = loadAuthSecret();
if (AUTH_SECRET.length < 32) {
  throw new Error(
    `[teslamatefix] AUTH_SECRET doit faire au moins 32 caractères ` +
      `(actuellement ${AUTH_SECRET.length}). Générer avec : openssl rand -base64 32`,
  );
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  AUTH_SECRET,
  DEFAULT_LOCALE: optional("DEFAULT_LOCALE", "fr") as "fr" | "en",
  LOG_LEVEL: optional("LOG_LEVEL", "info"),
  READ_ONLY: optional("READ_ONLY", "false") === "true",
  PORT: parseInt(optional("PORT", "3001"), 10),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  /**
   * Chemin du volume persistant utilisé pour les secrets bootstrap-able
   * (username, hash bcrypt, flag force-change). L'entrypoint Docker garantit
   * que ce dossier existe et appartient au user `node`.
   */
  SECRETS_DIR,
  /**
   * Fleet API (photo officielle du véhicule, depuis v0.5.2). Tout optionnel :
   *   - TESLAMATE_ENCRYPTION_KEY : même valeur que `ENCRYPTION_KEY` de TeslaMate,
   *     pour déchiffrer (en lecture seule) le token OAuth stocké dans `tokens` ;
   *   - TESLA_FLEET_API_BASE_URL : base régionale de la Fleet API (EU par défaut) ;
   *   - TESLA_VEHICLE_OPTIONS : codes option de repli (séparés par des virgules)
   *     si l'appel Fleet échoue. Échapper les `$` (`\$MTY68,...`) côté .env.
   */
  TESLAMATE_ENCRYPTION_KEY: optional("TESLAMATE_ENCRYPTION_KEY", ""),
  TESLA_FLEET_API_BASE_URL: optional(
    "TESLA_FLEET_API_BASE_URL",
    "https://fleet-api.prd.eu.vn.cloud.tesla.com",
  ),
  TESLA_VEHICLE_OPTIONS: optional("TESLA_VEHICLE_OPTIONS", ""),
  /**
   * Assistant de création de trajet (depuis v0.6.0). Tout optionnel :
   *   - GEOCODER_BASE_URL : instance Nominatim (search + reverse) pour
   *     l'autocomplétion d'adresses avec numéros de rue. Défaut = instance
   *     publique OSM (soumise à une policy de quota : ~1 req/s, User-Agent requis).
   *   - ROUTER_BASE_URL : instance OSRM pour le calcul d'itinéraire.
   *   - GEO_USER_AGENT : User-Agent envoyé à Nominatim (policy). Mettre un
   *     contact réel si l'instance publique est utilisée en volume.
   *   - DRIVE_CONSUMPTION_WH_KM : conso réelle estimée (Wh/km) pour décrémenter
   *     l'autonomie/batterie le long du trajet généré.
   *   - DRIVE_RATED_WH_KM : conso de référence de l'autonomie estimée (rated).
   */
  GEOCODER_BASE_URL: optional(
    "GEOCODER_BASE_URL",
    "https://nominatim.openstreetmap.org",
  ),
  ROUTER_BASE_URL: optional("ROUTER_BASE_URL", "https://router.project-osrm.org"),
  GEO_USER_AGENT: optional(
    "GEO_USER_AGENT",
    "TeslaMateFix/0.6.0 (+https://github.com/kerkeniw/TeslaMateFix)",
  ),
  DRIVE_CONSUMPTION_WH_KM: parseFloat(optional("DRIVE_CONSUMPTION_WH_KM", "170")),
  DRIVE_RATED_WH_KM: parseFloat(optional("DRIVE_RATED_WH_KM", "150")),
} as const;

export type Env = typeof env;
