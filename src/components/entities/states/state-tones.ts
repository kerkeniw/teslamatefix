/**
 * Tones cockpit pour les 3 états véhicule (online/asleep/offline).
 * Partagé entre :
 * - le badge "Statut" du Dashboard (src/components/dashboard/dashboard.tsx)
 * - StateBadge dans les listes/details states
 *
 * Tokens utilisés : --ok, --critical, --muted-foreground (déclinés depuis
 * globals.css en light/dark).
 */
export type StateStatus = "online" | "offline" | "asleep";

export const STATE_TONES: Record<
  StateStatus,
  { dot: string; text: string; bg: string; border: string }
> = {
  online: {
    dot: "bg-ok",
    text: "text-ok",
    bg: "bg-ok/10",
    border: "border-ok/30",
  },
  asleep: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
  },
  offline: {
    dot: "bg-critical",
    text: "text-critical",
    bg: "bg-critical/10",
    border: "border-critical/30",
  },
};
