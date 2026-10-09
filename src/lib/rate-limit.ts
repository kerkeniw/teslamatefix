/**
 * Rate limiter en mémoire (LRU simple) — suffisant pour un déploiement homelab
 * mono-instance. Pour du multi-instance, remplacer par Redis.
 *
 * Politique par défaut : N tentatives sur une fenêtre glissante de M millisecondes.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly capacity: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(max: number, windowMs: number, capacity = 1000) {
    this.max = max;
    this.windowMs = windowMs;
    this.capacity = capacity;
  }

  /**
   * Renvoie `{ ok: true }` si la requête est autorisée, sinon `{ ok: false, retryAfterMs }`.
   * Incrémente le compteur uniquement quand `ok: true`.
   */
  check(key: string): { ok: true } | { ok: false; retryAfterMs: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
    }

    if (bucket.count >= this.max) {
      return { ok: false, retryAfterMs: bucket.resetAt - now };
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);
    this.evictIfNeeded();
    return { ok: true };
  }

  /** Réinitialise le compteur pour une clé donnée (ex. après login réussi). */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  private evictIfNeeded(): void {
    if (this.buckets.size <= this.capacity) return;
    // Eviction grossière : supprime les buckets expirés ; sinon les plus anciens.
    const now = Date.now();
    for (const [k, v] of this.buckets) {
      if (v.resetAt <= now) this.buckets.delete(k);
      if (this.buckets.size <= this.capacity) return;
    }
    const overflow = this.buckets.size - this.capacity;
    let i = 0;
    for (const k of this.buckets.keys()) {
      if (i >= overflow) break;
      this.buckets.delete(k);
      i += 1;
    }
  }
}

// 5 tentatives / 5 min / IP — borne le brute-force tout en restant utilisable.
export const loginRateLimiter = new RateLimiter(5, 5 * 60 * 1000);

// Mutations (server actions d'écriture) : 60 / min / utilisateur. Large pour un
// usage normal (une correction = 1 à 3 appels), bloque un script qui boucle avec
// une session volée (Medium #6 de SECURITY_REVIEW.md).
export const mutationRateLimiter = new RateLimiter(60, 60 * 1000);

export const RATE_LIMITED_ERROR =
  "Trop de modifications en peu de temps. Réessayez dans une minute.";

/**
 * À appeler dans chaque server action d'écriture, après le garde `READ_ONLY` :
 *   const limited = mutationLimited(session.userId);
 *   if (limited) return limited;
 */
export function mutationLimited(userId: string): { ok: false; error: string } | null {
  return mutationRateLimiter.check(`mutation:${userId}`).ok
    ? null
    : { ok: false, error: RATE_LIMITED_ERROR };
}

/**
 * IP cliente pour la limite de connexion.
 *
 * Sans `trustProxy`, `X-Forwarded-For` / `X-Real-IP` sont falsifiables par le
 * client : on les ignore et on renvoie une clé unique (`direct`), ce qui rend la
 * limite globale — acceptable pour une application mono-utilisateur. Avec
 * `trustProxy`, on lit `X-Real-IP`, sinon l'entrée la plus à droite de
 * `X-Forwarded-For` (celle ajoutée par le proxy, pas par le client).
 */
export function clientIp(headers: Pick<Headers, "get">, trustProxy: boolean): string {
  if (!trustProxy) return "direct";
  const xri = headers.get("x-real-ip");
  if (xri && xri.trim()) return xri.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}
