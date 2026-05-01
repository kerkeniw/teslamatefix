import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3001);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Playwright pour TeslaMateFix.
 * - Démarre `npm run start` (qui suppose `npm run build` lancé au préalable)
 *   et attend `/api/health` 200 avant d'ouvrir les specs.
 * - Chromium uniquement pour rester rapide ; ajouter Firefox/WebKit plus tard
 *   si nécessaire.
 *
 * Variables : E2E_BASE_URL pour pointer une instance déjà déployée.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: `${BASE_URL}/api/health`,
        timeout: 60_000,
        reuseExistingServer: !process.env.CI,
      },
});
