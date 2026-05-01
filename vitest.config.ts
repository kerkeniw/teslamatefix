import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Configuration Vitest — tests unitaires des règles d'intégrité.
 *
 * - environnement Node (logique pure / Prisma mocké, pas besoin de jsdom)
 * - tests cantonnés à `tests/unit/**` pour ne pas mélanger avec les e2e
 *   Playwright (qui vivent sous `e2e/`).
 * - alias `@/*` aligné sur tsconfig pour pouvoir importer
 *   `@/lib/integrity/...` exactement comme dans le code applicatif.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
