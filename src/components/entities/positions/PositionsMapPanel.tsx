"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SAFETY_CAP, type MapPoint } from "@/lib/positions/map-points";
import { fetchPositionMapBatchAction } from "@/app/[locale]/positions/map-actions";
import { DriveFilterList, type DriveListItem } from "./DriveFilterList";

const PositionsMap = dynamic(
  () => import("./PositionsMap").then((m) => m.PositionsMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[70vh] min-h-[420px] w-full animate-pulse rounded-lg bg-muted" />
    ),
  },
);

export type MapParams = {
  from: string | null;
  to: string | null;
  driveId: number | null;
};

/**
 * Boucle de chargement par lots — définie hors composant pour que le lint React
 * Compiler ne considère pas les `setState` (passés en callbacks) comme synchrones
 * dans un effet. S'arrête à `done`, au plafond `cap`, ou si `isCancelled()`.
 */
async function runBatchLoop(opts: {
  driveId: number | null;
  from: string | null;
  to: string | null;
  startCursor: number | null;
  cap: number;
  isCancelled: () => boolean;
  cursorRef: { current: number | null };
  loadedRef: { current: number };
  onPoints: (pts: MapPoint[]) => void;
  onDone: () => void;
  onCapReached: () => void;
}) {
  let cur = opts.startCursor;
  while (!opts.isCancelled()) {
    const res = await fetchPositionMapBatchAction({
      driveId: opts.driveId,
      from: opts.from,
      to: opts.to,
      cursor: cur,
    });
    if (opts.isCancelled()) return;

    if (res.points.length > 0) {
      opts.onPoints(res.points);
      opts.loadedRef.current += res.points.length;
    }
    if (res.done) {
      opts.cursorRef.current = null;
      opts.onDone();
      return;
    }
    cur = res.nextCursor;
    opts.cursorRef.current = cur;
    if (opts.loadedRef.current >= opts.cap) {
      opts.onCapReached();
      return;
    }
  }
}

/**
 * Point d'entrée : remonte l'orchestrateur via une `key` dérivée de la plage.
 * Le remount garantit un état neuf (points, sélection, curseur) sans reset
 * synchrone dans un effet — et invalide naturellement toute boucle en cours.
 */
export function PositionsMapPanel({
  params,
  drives,
}: {
  params: MapParams;
  drives: DriveListItem[];
}) {
  const key = `${params.from ?? ""}|${params.to ?? ""}|${params.driveId ?? ""}`;
  return <MapLoader key={key} params={params} drives={drives} />;
}

function MapLoader({ params, drives }: { params: MapParams; drives: DriveListItem[] }) {
  const t = useTranslations("positions");
  const { from, to, driveId } = params;

  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [capReached, setCapReached] = useState(false);

  // Sélection par ensemble des trajets *masqués* (défaut vide = tous visibles).
  // Un trajet découvert en cours de chargement est donc visible par défaut, sans
  // effet setState (le remount par `key` réinitialise l'état sur changement de plage).
  const [hiddenDrives, setHiddenDrives] = useState<Set<number>>(() => new Set());
  const [showLoose, setShowLoose] = useState(true);

  // Annulation par run (immunisée contre le double-invoke Strict Mode) : chaque
  // exécution de l'effet possède son propre flag ; `isCancelledRef` expose celui
  // du run courant pour que `loadMore` poursuive la bonne boucle.
  const isCancelledRef = useRef<() => boolean>(() => false);
  const cursorRef = useRef<number | null>(null);
  const loadedRef = useRef(0);
  const capRef = useRef(SAFETY_CAP);
  // Ids déjà accumulés → garantit des clés React uniques même en cas de réentrance.
  const seenIdsRef = useRef<Set<number>>(new Set());

  const startLoop = useCallback(
    (startCursor: number | null, isCancelled: () => boolean) => {
      void runBatchLoop({
        driveId,
        from,
        to,
        startCursor,
        cap: capRef.current,
        isCancelled,
        cursorRef,
        loadedRef,
        onPoints: (pts) =>
          setPoints((prev) => {
            const seen = seenIdsRef.current;
            const fresh = pts.filter((p) => !seen.has(p.id));
            if (fresh.length === 0) return prev;
            for (const p of fresh) seen.add(p.id);
            return prev.concat(fresh);
          }),
        onDone: () => {
          setDone(true);
          setLoading(false);
        },
        onCapReached: () => {
          setCapReached(true);
          setLoading(false);
        },
      });
    },
    [driveId, from, to],
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    isCancelledRef.current = isCancelled;
    startLoop(null, isCancelled);
    return () => {
      cancelled = true;
    };
  }, [startLoop]);

  function loadMore() {
    capRef.current += SAFETY_CAP;
    setCapReached(false);
    setLoading(true);
    startLoop(cursorRef.current, isCancelledRef.current);
  }

  // Trajets réellement chargés (dérivés du flux de points), + première date vue.
  const { loadedDriveIds, firstDateByDrive } = useMemo(() => {
    const ids = new Set<number>();
    const fd = new Map<number, string>();
    for (const p of points) {
      if (p.drive_id == null) continue;
      ids.add(p.drive_id);
      const prev = fd.get(p.drive_id);
      if (prev === undefined || p.date < prev) fd.set(p.drive_id, p.date);
    }
    return { loadedDriveIds: ids, firstDateByDrive: fd };
  }, [points]);

  // Liste affichée : trajets chargés enrichis des métadonnées SSR (date + distance),
  // triés chronologiquement (ascendant). Grandit au fil des lots.
  const displayedDrives = useMemo(() => {
    const meta = new Map(drives.map((d) => [d.id, d]));
    const list: DriveListItem[] = [];
    for (const id of loadedDriveIds) {
      const m = meta.get(id);
      list.push(
        m ?? {
          id,
          start_date: firstDateByDrive.get(id) ?? "",
          end_date: null,
          distance: null,
        },
      );
    }
    list.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id);
    return list;
  }, [drives, loadedDriveIds, firstDateByDrive]);

  const hasLoose = useMemo(() => points.some((p) => p.drive_id == null), [points]);
  const fitKey = `${from ?? ""}|${to ?? ""}|${driveId ?? ""}`;
  const isEmpty = done && points.length === 0;

  function toggleDrive(id: number) {
    setHiddenDrives((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setHiddenDrives(new Set());
    setShowLoose(true);
  }
  function selectNone() {
    setHiddenDrives(new Set(displayedDrives.map((d) => d.id)));
    setShowLoose(false);
  }

  return (
    <Card size="sm">
      <CardContent className="grid gap-3 lg:grid-cols-[220px_1fr]">
        <aside className="flex flex-col lg:h-[70vh] lg:min-h-[420px]">
          <DriveFilterList
            drives={displayedDrives}
            hiddenDrives={hiddenDrives}
            showLoose={showLoose}
            hasLoose={hasLoose}
            onToggleDrive={toggleDrive}
            onToggleLoose={() => setShowLoose((v) => !v)}
            onSelectAll={selectAll}
            onSelectNone={selectNone}
          />
        </aside>

        <div className="space-y-2">
          {isEmpty ? (
            <div className="flex h-[70vh] min-h-[420px] items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
              {t("map.empty")}
            </div>
          ) : (
            <PositionsMap
              points={points}
              hiddenDrives={hiddenDrives}
              showLoose={showLoose}
              fitKey={fitKey}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {loading
                ? t("map.loading", { n: points.length })
                : t("map.loadedCount", { n: points.length })}
            </span>
            {capReached && !loading ? (
              <Button size="sm" variant="outline" onClick={loadMore}>
                {t("map.loadMore")}
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
