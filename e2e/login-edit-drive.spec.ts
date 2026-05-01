import { test, expect } from "@playwright/test";

/**
 * Parcours utilisateur principal :
 *   non-authentifié → /login → connexion → / (dashboard) → ouverture du
 *   dernier drive en édition → déconnexion → /login.
 *
 * Le test est non-destructif : il vérifie l'affichage et la navigation, sans
 * modifier de données. Les credentials viennent de l'env (.env.test ou .env)
 * et tombent en défaut sur `admin / admin` (cohérent avec le scaffold de dev).
 */

const USERNAME = process.env.E2E_USERNAME ?? "admin";
const PASSWORD = process.env.E2E_PASSWORD ?? "admin";

test("login → dashboard → edit last drive → logout", async ({ page }) => {
  // 1) Toute route protégée redirige vers /login (avec ?from= préservé).
  await page.goto("/");
  await expect(page).toHaveURL(/\/login(\?|$)/);

  // 2) Login.
  await page.getByLabel(/identifiant|username/i).fill(USERNAME);
  await page.getByLabel(/mot de passe|password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /connecter|sign in/i }).click();

  // 3) Dashboard. La quick-action "Dernier trajet" / "Last drive" doit être
  //    présente même quand il n'y en a pas (le placeholder est rendu).
  await expect(page).toHaveURL(/\/(fr|en)?\/?$/);
  await expect(
    page.getByRole("heading", { name: /tableau de bord|dashboard/i }),
  ).toBeVisible();

  // 4) Si un drive existe, "Modifier" est cliquable. Sinon on saute.
  const editLink = page
    .getByRole("link", { name: /^modifier$|^edit$/i })
    .first();
  if (await editLink.isVisible().catch(() => false)) {
    await editLink.click();
    await expect(page).toHaveURL(/\/(drives|charges)\/\d+/);
    await page.goBack();
  }

  // 5) Déconnexion via le form du header.
  await page
    .getByRole("button", { name: /déconnexion|log ?out/i })
    .click();
  await expect(page).toHaveURL(/\/login/);
});
