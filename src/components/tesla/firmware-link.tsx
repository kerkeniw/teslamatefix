import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildReleaseNotesUrl } from "@/lib/firmware";

/**
 * Lien sortant vers les release notes d'une version firmware Tesla.
 * Composant partagé entre le dashboard, la liste /updates et la page d'édition.
 * Si la version est nulle ou vide, n'affiche qu'un libellé inerte.
 */
export function FirmwareLink({
  version,
  className,
  showIcon = true,
  fallbackLabel = "—",
}: {
  version?: string | null;
  className?: string;
  showIcon?: boolean;
  fallbackLabel?: string;
}) {
  if (!version) {
    return <span className={cn("text-muted-foreground", className)}>{fallbackLabel}</span>;
  }
  const href = buildReleaseNotesUrl(version);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-medium text-tesla-red underline-offset-4 hover:underline",
        className,
      )}
      aria-label={`Notes de version pour le firmware ${version} (s'ouvre dans un nouvel onglet)`}
    >
      <span>{version}</span>
      {showIcon ? <ExternalLink className="size-3.5" aria-hidden /> : null}
    </a>
  );
}
