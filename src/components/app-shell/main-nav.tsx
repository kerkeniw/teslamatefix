"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Navigation principale entre les 9 entités fonctionnelles. Chip-nav
 * horizontale scrollable, mêmes idiomes que le pattern Cockpit (Fira Code,
 * actif en bleu HUD translucide).
 */
const ITEMS = [
  { href: "/drives", key: "drives" },
  { href: "/charges", key: "charges" },
  { href: "/positions", key: "positions" },
  { href: "/addresses", key: "addresses" },
  { href: "/geofences", key: "geofences" },
  { href: "/states", key: "states" },
  { href: "/updates", key: "updates" },
  { href: "/cars", key: "cars" },
  { href: "/settings", key: "settings" },
] as const;

export function MainNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav className="overflow-x-auto border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <ul className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
        {ITEMS.map((item) => {
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
