import { describe, expect, it, beforeAll } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { clientIp, RateLimiter, mutationLimited, mutationRateLimiter } from "@/lib/rate-limit";

/**
 * Durcissement v0.8.0 (SECURITY_REVIEW.md, Medium #5 à #7, Low #12).
 * `logger` et `env` lisent l'environnement au chargement : import dynamique
 * après avoir posé les variables requises.
 */

let safeErr: typeof import("@/lib/logger").safeErr;
let cookieSecure: typeof import("@/lib/env").cookieSecure;
let resolveWorkDir: typeof import("@/lib/env").resolveWorkDir;

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "x".repeat(32);
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
  ({ safeErr } = await import("@/lib/logger"));
  ({ cookieSecure, resolveWorkDir } = await import("@/lib/env"));
});

function headers(h: Record<string, string>) {
  return new Headers(h);
}

describe("clientIp (Medium #5)", () => {
  it("ignore X-Forwarded-For / X-Real-IP sans TRUST_PROXY", () => {
    expect(clientIp(headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" }), false)).toBe(
      "direct",
    );
  });

  it("préfère X-Real-IP derrière un proxy de confiance", () => {
    expect(clientIp(headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2", "x-real-ip": "9.9.9.9" }), true)).toBe(
      "9.9.9.9",
    );
  });

  it("prend l'entrée la plus à droite de X-Forwarded-For (ajoutée par le proxy)", () => {
    expect(clientIp(headers({ "x-forwarded-for": "6.6.6.6, 10.0.0.7" }), true)).toBe("10.0.0.7");
  });

  it("renvoie unknown sans en-tête derrière un proxy", () => {
    expect(clientIp(headers({}), true)).toBe("unknown");
  });
});

describe("limite de débit des mutations (Medium #6)", () => {
  it("bloque au-delà du maximum puis se réinitialise", () => {
    const rl = new RateLimiter(2, 60_000);
    expect(rl.check("k").ok).toBe(true);
    expect(rl.check("k").ok).toBe(true);
    expect(rl.check("k").ok).toBe(false);
    rl.reset("k");
    expect(rl.check("k").ok).toBe(true);
  });

  it("mutationLimited renvoie une erreur après 60 écritures par minute", () => {
    const user = `test-${Date.now()}`;
    for (let i = 0; i < 60; i++) expect(mutationLimited(user)).toBeNull();
    expect(mutationLimited(user)).toMatchObject({ ok: false });
    mutationRateLimiter.reset(`mutation:${user}`);
  });
});

describe("safeErr (Medium #7)", () => {
  it("ne garde que le nom et le code d'une erreur Prisma", () => {
    const e = new Prisma.PrismaClientKnownRequestError(
      "Invalid `prisma.positions.update()` invocation: latitude 48.8566 longitude 2.3522",
      { code: "P2025", clientVersion: "6.0.0" },
    );
    const out = safeErr(e);
    expect(out).toEqual({ name: "PrismaClientKnownRequestError", code: "P2025" });
    expect(JSON.stringify(out)).not.toContain("48.8566");
  });

  it("tronque le message des autres erreurs à sa première ligne", () => {
    const out = safeErr(new Error("fetch failed\nstack details"));
    expect(out).toEqual({ name: "Error", message: "fetch failed" });
  });

  it("gère les valeurs non-objet", () => {
    expect(safeErr("boom")).toEqual({ name: "string", message: "boom" });
  });
});

describe("cookieSecure (Low #12)", () => {
  it("auto suit NODE_ENV", () => {
    expect(cookieSecure("auto", "production")).toBe(true);
    expect(cookieSecure("auto", "development")).toBe(false);
  });

  it("true / false forcent la valeur", () => {
    expect(cookieSecure("true", "development")).toBe(true);
    expect(cookieSecure("false", "production")).toBe(false);
  });
});

describe("resolveWorkDir (répertoire de travail var/)", () => {
  it("var/ relatif au répertoire de lancement par défaut, variable vide comprise", () => {
    expect(resolveWorkDir(undefined, "/app")).toBe("/app/var");
    expect(resolveWorkDir("", "/app")).toBe("/app/var");
    expect(resolveWorkDir("   ", "/projet")).toBe("/projet/var");
  });

  it("TMFIX_WORK_DIR relatif ou absolu", () => {
    expect(resolveWorkDir("tmp/work", "/app")).toBe("/app/tmp/work");
    expect(resolveWorkDir("/srv/tmfix", "/app")).toBe("/srv/tmfix");
  });
});
