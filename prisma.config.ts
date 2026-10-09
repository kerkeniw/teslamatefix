/**
 * Configuration de la CLI Prisma 7 (`prisma generate`, `prisma db pull`).
 *
 * Prisma 7 ne lit plus `.env` tout seul : on le charge ici, sans dépendance,
 * avec `process.loadEnvFile` (Node ≥ 21.7). Absent (image Docker, CI) → ignoré.
 * L'URL n'est requise que par `db pull` : `generate` doit fonctionner sans
 * (stage `deps` du Dockerfile, `postinstall`).
 *
 * L'application, elle, se connecte via l'adaptateur `pg` (`src/lib/db.ts`).
 */
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile(".env");
} catch {
  /* pas de .env : variables déjà dans l'environnement */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
