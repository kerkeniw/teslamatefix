"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MonitorCog, Moon, SunMedium } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "light" | "system" | "dark";

const MODES: { key: Mode; label: string; icon: typeof SunMedium }[] = [
  { key: "light", label: "Light", icon: SunMedium },
  { key: "system", label: "Auto", icon: MonitorCog },
  { key: "dark", label: "Dark", icon: Moon },
];

/**
 * Sélecteur dark / light / system (mêmes idiomes que LocaleSwitcher : button
 * group avec `aria-pressed`). Guarde de montage pour éviter le flash
 * d'hydratation : `useTheme` lit le DOM côté client uniquement.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (mounted ? theme : "system") as Mode;

  return (
    <div role="group" aria-label="Thème" className="flex gap-0.5">
      {MODES.map(({ key, label, icon: Icon }) => (
        <Button
          key={key}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setTheme(key)}
          aria-pressed={current === key}
          aria-label={label}
          className={cn(
            "size-9 px-0",
            current === key && "bg-accent text-accent-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </Button>
      ))}
    </div>
  );
}
