import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Helpers de navigation locale-aware.
 * Utiliser `<Link href="/drives" />` pour rester dans la locale courante,
 * ou `<Link href="/drives" locale="en" />` pour forcer la locale.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
