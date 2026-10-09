import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * En-tête de page compact, aligné sur l'écran d'édition des charges : le titre,
 * l'identifiant (`#id`, police mono) et le sous-titre (petite police) tiennent
 * sur une seule ligne ; les actions sont à droite. Objectif : gagner de la
 * hauteur pour que la page tienne sur un écran d'ordinateur courant.
 */
export function PageHeader({
  title,
  id,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  /** Identifiant affiché après le titre (`#42`). */
  id?: number | string;
  subtitle?: ReactNode;
  /** Boutons / menus alignés à droite. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {title}
          {id != null ? (
            <>
              {" "}
              <span className="font-mono text-base text-muted-foreground">#{id}</span>
            </>
          ) : null}
        </h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
