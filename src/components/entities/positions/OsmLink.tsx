"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

export function OsmLink({
  latitude,
  longitude,
  className,
}: {
  latitude: string | number;
  longitude: string | number;
  className?: string;
}) {
  const t = useTranslations("positions");
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=15`}
      target="_blank"
      rel="noreferrer"
      className={
        className ??
        "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      }
    >
      <ExternalLink className="size-3" aria-hidden />
      {t("openOsm")}
    </a>
  );
}
