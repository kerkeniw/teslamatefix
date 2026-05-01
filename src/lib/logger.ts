import pino from "pino";
import { env } from "./env";

/**
 * Logger structuré JSON sur stdout, lisible via `docker logs`.
 * Étape 10 du plan complétera ce logger avec un wrapper d'audit pour les
 * mutations CRUD (action/table/id/diff_keys).
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { app: "teslamatefix" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
