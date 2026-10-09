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

/**
 * Forme journalisable d'une erreur, **sans payload** (Medium #7) : les messages
 * Prisma recopient les arguments de la requête (coordonnées, adresses…). On ne
 * garde que le nom, le code Prisma éventuel et la première ligne (tronquée) du
 * message des erreurs non Prisma.
 */
export function safeErr(e: unknown): { name: string; code?: string; message?: string } {
  if (e == null || typeof e !== "object") {
    return { name: typeof e, message: String(e).slice(0, 200) };
  }
  const err = e as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof err.name === "string" ? err.name : "Error";
  const code = typeof err.code === "string" ? err.code : undefined;
  if (name.startsWith("PrismaClient")) return code ? { name, code } : { name };
  const message =
    typeof err.message === "string" ? err.message.split("\n")[0].slice(0, 200) : undefined;
  return { name, ...(code ? { code } : {}), ...(message ? { message } : {}) };
}

const lastWarn = new Map<string, number>();

/**
 * Avertissement répété au plus toutes les `intervalMs` (10 min par défaut) pour
 * une même clé : un problème persistant (jeton Tesla expiré…) reste visible
 * dans les journaux sans les inonder à chaque rendu de page.
 */
export function warnThrottled(
  key: string,
  payload: Record<string, unknown>,
  msg: string,
  intervalMs = 10 * 60 * 1000,
): void {
  const now = Date.now();
  const last = lastWarn.get(key);
  if (last != null && now - last < intervalMs) return;
  lastWarn.set(key, now);
  logger.warn(payload, msg);
}
