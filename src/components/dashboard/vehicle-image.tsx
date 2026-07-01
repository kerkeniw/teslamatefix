"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { VehicleImageSet } from "@/lib/tesla/vehicle-image";
import { cn } from "@/lib/utils";

const AUTOPLAY_MS = 4000;

/**
 * Slider des photos officielles Tesla (compositor) dans le bloc STATUS.
 *
 * - défilement automatique (pause au survol) ;
 * - flèches `<`/`>` visibles au survol pour changer de vue ;
 * - `<img>` natif (compositor déjà dimensionné, pas de CSP) ;
 * - une vue dont l'image échoue au chargement est retirée du carrousel
 *   (`onError`) — ex. `INTERIOR_ROW2` si le jeu de codes ne la supporte pas.
 * - un badge discret rappelle l'origine des codes (API Tesla / variable d'env).
 */
export function VehicleImage({
  image,
  model,
}: {
  image: VehicleImageSet | null;
  model: string;
}) {
  const t = useTranslations("dashboard");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const views = useMemo(
    () => (image?.views ?? []).filter((v) => !failed.has(v.view)),
    [image, failed],
  );
  const count = views.length;

  // Défilement automatique, suspendu au survol ou s'il n'y a qu'une vue.
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, count]);

  if (!image || count === 0) return null;

  const safeIndex = index % count;
  const current = views[safeIndex];
  const viewLabel = (view: string) =>
    t.has(`views.${view}`) ? t(`views.${view}`) : view;
  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);

  return (
    <figure
      className="group relative flex flex-col items-center gap-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative w-full overflow-hidden">
        <div
          className="flex h-44 transition-transform duration-500 ease-out md:h-56"
          style={{ transform: `translateX(-${safeIndex * 100}%)` }}
        >
          {views.map((v) => (
            <div key={v.view} className="flex h-full min-w-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={v.url}
                alt={`${t("vehicleImageAlt", { model })} — ${viewLabel(v.view)}`}
                loading="lazy"
                onError={() =>
                  setFailed((prev) => {
                    const next = new Set(prev);
                    next.add(v.view);
                    return next;
                  })
                }
                className="h-full w-full object-contain"
              />
            </div>
          ))}
        </div>

        {count > 1 ? (
          <>
            <button
              type="button"
              aria-label={t("carousel.prev")}
              onClick={() => go(-1)}
              className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full border bg-background/70 p-1 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 group-hover:opacity-100"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("carousel.next")}
              onClick={() => go(1)}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full border bg-background/70 p-1 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 group-hover:opacity-100"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      <figcaption className="flex w-full items-center justify-between gap-2">
        <span
          title={t(`imageSource.${image.source}.title`)}
          className="inline-flex items-center gap-1.5 rounded-full border border-ok/35 bg-ok/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ok"
        >
          <span className="size-1.5 rounded-full bg-ok" aria-hidden />
          {t(`imageSource.${image.source}.badge`)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {viewLabel(current.view)}
        </span>
      </figcaption>

      {count > 1 ? (
        <div className="flex items-center gap-1.5">
          {views.map((v, i) => (
            <button
              key={v.view}
              type="button"
              aria-label={viewLabel(v.view)}
              aria-current={i === safeIndex}
              onClick={() => setIndex(i)}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i === safeIndex ? "bg-foreground" : "bg-muted-foreground/40 hover:bg-muted-foreground",
              )}
            />
          ))}
        </div>
      ) : null}
    </figure>
  );
}
