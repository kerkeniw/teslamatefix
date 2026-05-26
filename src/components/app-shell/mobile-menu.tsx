"use client";

import { useState } from "react";
import { Menu, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeSwitcher } from "./theme-switcher";
import { TimezonePicker } from "./timezone-picker";

type Props = {
  selectedTimezone: string;
  logoutAction: () => Promise<void> | void;
};

export function MobileMenu({ selectedTimezone, logoutAction }: Props) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tTz = useTranslations("timezone");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={tCommon("menu")} />
        }
      >
        <Menu className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent side="right" className="w-72 sm:w-80">
        <SheetHeader>
          <SheetTitle>{tCommon("menu")}</SheetTitle>
        </SheetHeader>

        <nav className="px-4">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent-blue/10 text-accent-blue"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    {t(item.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Separator />

        <div className="space-y-4 px-4">
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              {tTz("label")}
            </p>
            <TimezonePicker selected={selectedTimezone} />
          </div>
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              {tCommon("theme")}
            </p>
            <ThemeSwitcher />
          </div>
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              {tCommon("language")}
            </p>
            <LocaleSwitcher />
          </div>
        </div>

        <Separator />

        <form action={logoutAction} className="px-4 pb-4">
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start"
          >
            <LogOut className="size-4" aria-hidden />
            {tCommon("logout")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
