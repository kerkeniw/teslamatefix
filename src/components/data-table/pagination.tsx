"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Pagination offset basée sur les search params `?page=N&pageSize=K`.
 * À utiliser quand le backend renvoie un compteur total (entités modérées).
 * Pour les entités massives (positions, charges), préférer un cursor pagination
 * (à implémenter dans `cursor-pagination.tsx` au besoin).
 */
export function OffsetPagination({
  page,
  pageSize,
  total,
  pageSizeOptions = [25, 50, 100],
}: {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  function goTo(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`?${params.toString()}`);
  }

  function setPageSize(size: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pageSize", String(size));
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="text-xs text-muted-foreground">
        {total.toLocaleString("fr-FR")} ligne(s) — page {page} / {lastPage}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="rounded-md border border-input bg-transparent px-2 py-1 text-xs"
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
          onClick={() => goTo(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Page suivante"
          onClick={() => goTo(Math.min(lastPage, page + 1))}
          disabled={page >= lastPage}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
