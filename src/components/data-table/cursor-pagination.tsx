"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Pagination cursor pour les tables massives (positions, charges) où un COUNT
 * complet est interdit. Le serveur lit `?cursor=<id>&direction=next|prev&pageSize=K`
 * et retourne `pageSize+1` lignes pour détecter une page suivante. Les ids
 * exposés ici sont les ids de bord renvoyés par le serveur (premier/dernier
 * de la page courante).
 */
export function CursorPagination({
  firstId,
  lastId,
  hasNext,
  hasPrev,
  pageSize,
  pageSizeOptions = [25, 50, 100],
}: {
  firstId: number | null;
  lastId: number | null;
  hasNext: boolean;
  hasPrev: boolean;
  pageSize: number;
  pageSizeOptions?: number[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(cursor: number, direction: "next" | "prev") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", String(cursor));
    params.set("direction", direction);
    router.push(`?${params.toString()}`);
  }

  function reset() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");
    params.delete("direction");
    router.push(`?${params.toString()}`);
  }

  function setPageSize(size: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pageSize", String(size));
    params.delete("cursor");
    params.delete("direction");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground tabular-nums">
        <button
          type="button"
          onClick={reset}
          className="underline-offset-2 hover:underline"
        >
          {firstId !== null && lastId !== null
            ? `#${lastId} → #${firstId}`
            : "—"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="rounded-full border border-input bg-card px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="icon"
          aria-label="Page précédente"
          onClick={() => firstId !== null && navigate(firstId, "prev")}
          disabled={!hasPrev || firstId === null}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Page suivante"
          onClick={() => lastId !== null && navigate(lastId, "next")}
          disabled={!hasNext || lastId === null}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
