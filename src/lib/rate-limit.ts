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

class RateLimiter {
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

/** Extrait l'IP cliente d'une requête entrante, en respectant les reverse-proxies courants. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}
