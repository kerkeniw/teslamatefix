"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Navigation principale entre les 9 entités fonctionnelles. Sur mobile, à
 * encapsuler dans un Sheet ; sur desktop, scrollable horizontalement.
 * Les liens sont locale-aware via le router de next-intl.
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
    <nav className="overflow-x-auto border-b bg-background">
      <ul className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2 text-sm">
        {ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "block whitespace-nowrap rounded-md px-3 py-1.5 transition-colors",
                  active
                    ? "bg-tesla-red text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
