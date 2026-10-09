import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Journaux v0.8.0 : jeton Tesla expiré détecté avant l'appel, avertissements
 * espacés plutôt qu'uniques, journaux Prisma désactivés par défaut.
 * `env` exige des variables au chargement : imports dynamiques.
 */

let jwtExpiry: typeof import("@/lib/tesla/token").jwtExpiry;
let warnThrottled: typeof import("@/lib/logger").warnThrottled;
let logger: typeof import("@/lib/logger").logger;
let prismaLogLevels: typeof import("@/lib/db").prismaLogLevels;

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "x".repeat(32);
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
  ({ jwtExpiry } = await import("@/lib/tesla/token"));
  ({ warnThrottled, logger } = await import("@/lib/logger"));
  ({ prismaLogLevels } = await import("@/lib/db"));
});

function jwt(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.signature`;
}

describe("jwtExpiry", () => {
  it("lit la date d'expiration d'un JWT", () => {
    expect(jwtExpiry(jwt({ exp: 1_791_567_916 }))?.toISOString()).toBe("2026-10-09T17:45:16.000Z");
  });

  it("null sans exp ou si illisible", () => {
    expect(jwtExpiry(jwt({ sub: "x" }))).toBeNull();
    expect(jwtExpiry("pas-un-jwt")).toBeNull();
  });
});

describe("warnThrottled", () => {
  it("répète un avertissement au plus une fois par intervalle", () => {
    const spy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.useFakeTimers();
    try {
      const key = `test-${Date.now()}`;
      warnThrottled(key, { event: key }, "msg", 60_000);
      warnThrottled(key, { event: key }, "msg", 60_000);
      expect(spy).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60_001);
      warnThrottled(key, { event: key }, "msg", 60_000);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
    }
  });
});

describe("prismaLogLevels", () => {
  it("aucun journal Prisma par défaut", () => {
    expect(prismaLogLevels(undefined)).toEqual([]);
    expect(prismaLogLevels("")).toEqual([]);
  });

  it("niveaux choisis par PRISMA_LOG, valeurs inconnues ignorées", () => {
    expect(prismaLogLevels("query, warn,error,debug")).toEqual(["query", "warn", "error"]);
  });
});
