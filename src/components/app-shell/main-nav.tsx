"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Navigation principale entre les 9 entités fonctionnelles. Sur mobile, à
 * encapsuler dans un Sheet ; sur desktop, scrollable horizontalement.
 */
const ITEMS: { href: string; label: string }[] = [
  { href: "/drives", label: "Trajets" },
  { href: "/charges", label: "Charges" },
  { href: "/positions", label: "Positions" },
  { href: "/addresses", label: "Adresses" },
  { href: "/geofences", label: "Géofences" },
  { href: "/states", label: "États" },
  { href: "/updates", label: "Mises à jour" },
  { href: "/cars", label: "Véhicules" },
  { href: "/settings", label: "Paramètres" },
];

export function MainNav() {
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
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
