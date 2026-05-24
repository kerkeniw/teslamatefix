import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Tests des helpers d'auth introduits en v0.2.0 (lecture à chaud env/volume).
 * On utilise un répertoire temporaire pointé par TMFIX_SECRETS_DIR pour
 * éviter de toucher au vrai `/data` du système hôte.
 */

const originalEnv = { ...process.env };
let tmpDir: string;

beforeEach(() => {
  // Reset env entre chaque test pour ne pas se polluer.
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  Object.assign(process.env, originalEnv);

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmfix-secrets-"));
  process.env.TMFIX_SECRETS_DIR = tmpDir;
  // AUTH_SECRET requis par env.ts → on en met un valide pour pouvoir importer
  // dynamiquement `auth.ts` (qui dépend de env).
  process.env.AUTH_SECRET = "x".repeat(32);
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  // Pas de hash/username en env → on tombe sur le volume tmpDir.
  delete process.env.AUTH_PASSWORD_HASH;
  delete process.env.AUTH_USERNAME;

  // Reset le cache des modules pour relire env.ts et auth.ts proprement.
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function importAuth() {
  return await import("@/lib/auth");
}

describe("auth/getCurrentUsername", () => {
  it("retourne la valeur du fichier si l'env n'est pas défini", async () => {
    fs.writeFileSync(path.join(tmpDir, "username"), "myuser\n");
    const { getCurrentUsername } = await importAuth();
    expect(getCurrentUsername()).toBe("myuser");
  });

  it("priorité à l'env vars si défini", async () => {
    fs.writeFileSync(path.join(tmpDir, "username"), "from-file");
    process.env.AUTH_USERNAME = "from-env";
    const { getCurrentUsername } = await importAuth();
    expect(getCurrentUsername()).toBe("from-env");
  });

  it("fallback 'admin' si ni env ni fichier", async () => {
    const { getCurrentUsername } = await importAuth();
    expect(getCurrentUsername()).toBe("admin");
  });
});

describe("auth/getCurrentPasswordHash", () => {
  const validHash = "$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP";

  it("retourne le hash du fichier si l'env n'est pas défini", async () => {
    fs.writeFileSync(path.join(tmpDir, "password_hash"), validHash + "\n");
    const { getCurrentPasswordHash } = await importAuth();
    expect(getCurrentPasswordHash()).toBe(validHash);
  });

  it("priorité à l'env vars si défini", async () => {
    fs.writeFileSync(path.join(tmpDir, "password_hash"), "fileHash");
    process.env.AUTH_PASSWORD_HASH = validHash;
    const { getCurrentPasswordHash } = await importAuth();
    expect(getCurrentPasswordHash()).toBe(validHash);
  });

  it("throw explicite si ni env ni fichier", async () => {
    const { getCurrentPasswordHash } = await importAuth();
    expect(() => getCurrentPasswordHash()).toThrow(
      /Mot de passe non configuré/,
    );
  });
});

describe("auth/isPasswordChangeRequired", () => {
  it("true si le flag fichier existe et pas d'env AUTH_PASSWORD_HASH", async () => {
    fs.writeFileSync(path.join(tmpDir, "force_password_change"), "");
    const { isPasswordChangeRequired } = await importAuth();
    expect(isPasswordChangeRequired()).toBe(true);
  });

  it("false si l'env AUTH_PASSWORD_HASH est défini (mode legacy)", async () => {
    fs.writeFileSync(path.join(tmpDir, "force_password_change"), "");
    process.env.AUTH_PASSWORD_HASH = "envHash";
    const { isPasswordChangeRequired } = await importAuth();
    expect(isPasswordChangeRequired()).toBe(false);
  });

  it("false si le flag est absent", async () => {
    const { isPasswordChangeRequired } = await importAuth();
    expect(isPasswordChangeRequired()).toBe(false);
  });
});

describe("auth/persistPasswordHash", () => {
  const validHash = "$2b$12$ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";

  it("écrit le hash et supprime le flag force", async () => {
    fs.writeFileSync(path.join(tmpDir, "force_password_change"), "");
    const { persistPasswordHash } = await importAuth();
    persistPasswordHash(validHash);
    const written = fs.readFileSync(path.join(tmpDir, "password_hash"), "utf8").trim();
    expect(written).toBe(validHash);
    expect(fs.existsSync(path.join(tmpDir, "force_password_change"))).toBe(false);
  });

  it("throw si AUTH_PASSWORD_HASH est défini en env", async () => {
    process.env.AUTH_PASSWORD_HASH = "envHash";
    const { persistPasswordHash } = await importAuth();
    expect(() => persistPasswordHash(validHash)).toThrow(
      /AUTH_PASSWORD_HASH est défini en env/,
    );
  });

  it("ne plante pas si le flag n'existe pas déjà", async () => {
    const { persistPasswordHash } = await importAuth();
    expect(() => persistPasswordHash(validHash)).not.toThrow();
  });
});
