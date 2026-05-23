"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table/data-table";
import { OffsetPagination } from "@/components/data-table/pagination";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useAddressColumns, type AddressRow } from "./AddressDataTableColumns";

export function AddressListClient({
  data,
  total,
  page,
  pageSize,
  initialQuery,
}: {
  data: AddressRow[];
  total: number;
  page: number;
  pageSize: number;
  initialQuery: string;
}) {
  const t = useTranslations("addresses");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [, startTransition] = useTransition();
  const columns = useAddressColumns();

  function applyQuery(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim() === "") params.delete("q");
    else params.set("q", value.trim());
    params.set("page", "1");
    startTransition(() => router.push(`?${params.toString()}`));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyQuery(query);
          }}
          className="flex w-full gap-2 sm:max-w-md"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-8"
              aria-label={tCommon("search")}
            />
          </div>
          <Button type="submit" variant="outline">
            {tCommon("search")}
          </Button>
        </form>
        <ButtonLink href="/addresses/new">
          <Plus className="size-4" aria-hidden />
          {t("new")}
        </ButtonLink>
      </div>

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={data}
          emptyMessage={t("empty")}
        />
      </div>

      <div className="grid gap-3 md:hidden">
        {data.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}
        {data.map((row) => (
          <Card key={row.id} size="sm">
            <CardHeader>
              <CardTitle className="line-clamp-2">{row.display_name ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tCommon("id")}</span>
                <span className="font-mono">{row.id}</span>
              </div>
              {row.city ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.city")}</span>
                  <span>{row.city}</span>
                </div>
              ) : null}
              {row.country ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("fields.country")}</span>
                  <span>{row.country}</span>
                </div>
              ) : null}
              {row.latitude && row.longitude ? (
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">lat,lon</span>
                  <span>
                    {Number(row.latitude).toFixed(4)}, {Number(row.longitude).toFixed(4)}
                  </span>
                </div>
              ) : null}
              <div className="pt-2">
                <ButtonLink
                  size="sm"
                  variant="outline"
                  href={`/addresses/${row.id}`}
                  className="w-full"
                >
                  {tCommon("edit")}
                </ButtonLink>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <OffsetPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
