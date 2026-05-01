/**
 * Validation des variables d'environnement au démarrage.
 * Lance une erreur explicite si une variable critique manque, plutôt que d'échouer
 * cryptiquement plus tard. Importer ce module au plus tôt côté serveur.
 */

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

const AUTH_SECRET = required("AUTH_SECRET");
if (AUTH_SECRET.length < 32) {
  throw new Error(
    `[teslamatefix] AUTH_SECRET doit faire au moins 32 caractères ` +
      `(actuellement ${AUTH_SECRET.length}). Générer avec : openssl rand -base64 32`,
  );
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  AUTH_USERNAME: required("AUTH_USERNAME"),
  AUTH_PASSWORD_HASH: required("AUTH_PASSWORD_HASH"),
  AUTH_SECRET,
  DEFAULT_LOCALE: optional("DEFAULT_LOCALE", "fr") as "fr" | "en",
  LOG_LEVEL: optional("LOG_LEVEL", "info"),
  READ_ONLY: optional("READ_ONLY", "false") === "true",
  PORT: parseInt(optional("PORT", "3001"), 10),
  NODE_ENV: process.env.NODE_ENV ?? "development",
} as const;

export type Env = typeof env;
