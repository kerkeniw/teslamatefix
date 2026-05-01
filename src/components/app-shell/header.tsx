import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/tesla/logo";
import { Button } from "@/components/ui/button";

/**
 * Header global : logo cliquable vers la home + slot droit (sélecteur langue,
 * logout). La navigation principale (entités) est rendue séparément, soit en
 * tabs desktop, soit en sheet mobile (à brancher en step 5/9).
 */
export function AppHeader({ rightSlot }: { rightSlot?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          {rightSlot}
          <form action="/api/auth/logout" method="post">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              aria-label="Se déconnecter"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="sr-only md:not-sr-only">Déconnexion</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
