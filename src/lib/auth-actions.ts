"use server";

import { redirect } from "next/navigation";
import { logout } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * Server action de déconnexion. Préférée à une route handler `/api/auth/logout`
 * (vulnérable au CSRF avec SameSite=lax) car les server actions Next 16 ont une
 * vérification d'origine intégrée. Le `redirect("/login")` traverse le proxy
 * qui réinjecte la locale au besoin.
 */
export async function logoutAction(): Promise<void> {
  await logout();
  logger.info({ event: "logout.ok" }, "logout");
  redirect("/login");
}
