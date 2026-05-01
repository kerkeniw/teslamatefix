import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/tesla/logo";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth-actions";

/**
 * Header global : logo cliquable vers la home + slot droit (sélecteur langue,
 * logout). Les entités sont rendues via <MainNav />.
 */
export async function AppHeader({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const t = await getTranslations("common");
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          {rightSlot}
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
      </div>
    </header>
  );
}
