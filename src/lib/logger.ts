import pino from "pino";
import { env } from "./env";

/**
 * Logger structuré JSON sur stdout, lisible via `docker logs <container>`.
 * Toutes les server actions de mutation appellent `logger.info({event, user, id, ...})`
 * avec la nomenclature `<entity>.<action>` (ex. `drives.update`, `states.delete`,
 * `cars.update.error`). Pas de stockage en base : la sauvegarde Postgres reste la
 * source de vérité, les logs servent à tracer le "qui/quand/quoi".
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { app: "teslamatefix" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Helper standardisant les events d'audit. Une mutation appelle :
 *   audit({event: 'drives.update', user, id, diff: ['distance','duration_min']})
 * — les actions historiques utilisent `logger.info` directement, ce helper est
 * la voie recommandée pour les nouvelles.
 */
export function audit(payload: {
  event: string;
  user?: string;
  id?: number | string;
  diff?: string[];
  meta?: Record<string, unknown>;
}): void {
  logger.info(payload, payload.event);
}
