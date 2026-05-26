"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

/**
 * Navigation principale entre les 9 entités fonctionnelles. Chip-nav
 * horizontale scrollable, masquée sur mobile (rendue par MobileMenu).
 */
export function MainNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav className="hidden overflow-x-auto border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:block">
      <ul className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "block whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
                  active
                    ? "border-accent-blue/30 bg-accent-blue/10 text-accent-blue"
                    : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
