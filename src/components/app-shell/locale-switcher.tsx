"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Bascule FR / EN. Conserve la route courante et permute la locale.
 * Utilise le router locale-aware de next-intl.
 */
export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div role="group" aria-label="Langue" className="flex gap-0.5">
      {routing.locales.map((l) => (
        <Button
          key={l}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            router.replace(pathname, {
              locale: l,
              scroll: false,
            })
          }
          aria-pressed={l === locale}
          className={cn(
            "min-w-9 px-2 text-xs uppercase",
            l === locale && "bg-accent text-accent-foreground",
          )}
        >
          {l}
        </Button>
      ))}
    </div>
  );
}
