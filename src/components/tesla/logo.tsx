import { cn } from "@/lib/utils";

/**
 * Logo monogramme TeslaMateFix : un éclair rouge Tesla + le nom.
 * Utilise du texte plus une icône SVG inline pour rester léger.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", className)}>
      <Bolt className="size-5 text-tesla-red" aria-hidden />
      <span>
        Tesla<span className="text-tesla-red">Mate</span>Fix
      </span>
    </span>
  );
}

function Bolt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  );
}
