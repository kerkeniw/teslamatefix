import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/tesla/logo";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth-actions";
import { listCars, getSelectedCarOrDefault } from "@/lib/vehicle";
import { getSelectedTimezone } from "@/lib/timezone";
import { VehiclePicker } from "@/components/app-shell/vehicle-picker";
import { TimezonePicker } from "@/components/app-shell/timezone-picker";
import { ThemeSwitcher } from "@/components/app-shell/theme-switcher";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { MobileMenu } from "@/components/app-shell/mobile-menu";

/**
 * Header global. Toujours visible : logo + sélecteur véhicule.
 * Desktop (≥ md) : cluster fuseau + thème + langue + logout.
 * Mobile (< md) : tout le cluster bascule dans un menu burger (MobileMenu).
 */
export async function AppHeader() {
  const t = await getTranslations("common");
  const [cars, selected, timeZone] = await Promise.all([
    listCars(),
    getSelectedCarOrDefault(),
    getSelectedTimezone(),
  ]);
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          {selected ? <VehiclePicker cars={cars} selectedId={selected.id} /> : null}

          <div className="hidden items-center gap-2 md:flex">
            <TimezonePicker selected={timeZone} />
            <ThemeSwitcher />
            <LocaleSwitcher />
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                aria-label={t("logout")}
              >
                <LogOut className="size-4" aria-hidden />
                <span className="sr-only md:not-sr-only">{t("logout")}</span>
              </Button>
            </form>
          </div>

          <div className="md:hidden">
            <MobileMenu selectedTimezone={timeZone} logoutAction={logoutAction} />
          </div>
        </div>
      </div>
    </header>
  );
}
