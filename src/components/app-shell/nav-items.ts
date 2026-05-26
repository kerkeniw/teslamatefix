export type NavItem = { href: string; key: string };

export const NAV_ITEMS: readonly NavItem[] = [
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
