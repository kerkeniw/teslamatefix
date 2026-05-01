"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CursorPagination } from "@/components/data-table/cursor-pagination";
import { ConfirmDialog } from "@/components/tesla/confirm-dialog";
import { Link, useRouter } from "@/i18n/navigation";
import { OsmLink } from "./OsmLink";

export type PositionRow = {
  id: number;
  date: string;
  latitude: string;
  longitude: string;
  speed: number | null;
  battery_level: number | null;
  car_id: number;
  drive_id: number | null;
};

export function PositionListClient({
  data,
  firstId,
  lastId,
  hasNext,
  hasPrev,
  pageSize,
  filtersActive,
  deleteAction,
}: {
  data: PositionRow[];
  firstId: number | null;
  lastId: number | null;
  hasNext: boolean;
  hasPrev: boolean;
  pageSize: number;
  filtersActive: boolean;
  deleteAction: (
    ids: number[],
  ) => Promise<{ ok: boolean; error?: string; refused?: number[] }>;
}) {
  const t = useTranslations("positions");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();

  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    if (selected.size === data.length) setSelected(new Set());
    else setSelected(new Set(data.map((d) => d.id)));
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const r = await deleteAction(ids);
    if (!r.ok) {
      toast.error(r.error ?? tCommon("errorOccurred"));
      return;
    }
    if (r.refused && r.refused.length > 0) {
      toast.warning(t("delete.referencedByCharge"));
    } else {
      toast.success(tCommon("deleted"));
    }
    setSelected(new Set());
    router.refresh();
  }

  if (!filtersActive) {
    return (
      <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        {t("filtersRequired")}
      </div>
    );
  }

  const allChecked = data.length > 0 && selected.size === data.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {selected.size > 0 ? t("selected", { n: selected.size }) : null}
        </div>
        <div className="flex gap-2">
          {selected.size > 0 ? (
            <ConfirmDialog
              destructive
              title={t("delete.many.title", { n: selected.size })}
              description={t("delete.many.description", { n: selected.size })}
              confirmLabel={t("delete.many.confirm")}
              cancelLabel={tCommon("cancel")}
              onConfirm={handleBulkDelete}
              trigger={
                <Button variant="destructive">
                  <Trash2 className="size-4" aria-hidden />
                  {t("deleteSelection")}
                </Button>
              }
            />
          ) : null}
          <Button render={<Link href="/positions/new" />}>
            <Plus className="size-4" aria-hidden />
            {t("new")}
          </Button>
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="size-4 cursor-pointer accent-tesla-red"
                  aria-label="select all"
                />
              </TableHead>
              <TableHead className="font-mono text-xs">id</TableHead>
              <TableHead>{t("fields.date")}</TableHead>
              <TableHead>{t("fields.latitude")}</TableHead>
              <TableHead>{t("fields.longitude")}</TableHead>
              <TableHead>{t("fields.speed")}</TableHead>
              <TableHead>{t("fields.batteryLevel")}</TableHead>
              <TableHead>{t("fields.driveId")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      className="size-4 cursor-pointer accent-tesla-red"
                      aria-label={`select ${row.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.id}</TableCell>
                  <TableCell>{format.dateTime(new Date(row.date), "short")}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <span className="mr-2">{row.latitude}</span>
                    <OsmLink latitude={row.latitude} longitude={row.longitude} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.longitude}</TableCell>
                  <TableCell>{row.speed ?? "—"}</TableCell>
                  <TableCell>
                    {row.battery_level != null ? `${row.battery_level}%` : "—"}
                  </TableCell>
                  <TableCell>
                    {row.drive_id != null ? (
                      <Link
                        href={`/drives/${row.drive_id}`}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        #{row.drive_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      render={
                        <Link href={`/positions/${row.id}`} aria-label={tCommon("edit")} />
                      }
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {data.length === 0 ? (
          <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}
        {data.map((row) => (
          <Card key={row.id} size="sm">
            <CardContent className="space-y-1.5 pt-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    className="size-4 cursor-pointer accent-tesla-red"
                  />
                  <span className="font-mono">#{row.id}</span>
                </label>
                {row.drive_id != null ? (
                  <Badge variant="outline" className="font-mono">
                    drive #{row.drive_id}
                  </Badge>
                ) : null}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("fields.date")}</span>
                <span>{format.dateTime(new Date(row.date), "short")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">lat / lon</span>
                <OsmLink latitude={row.latitude} longitude={row.longitude} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("fields.speed")}</span>
                <span>{row.speed ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("fields.batteryLevel")}</span>
                <span>{row.battery_level != null ? `${row.battery_level}%` : "—"}</span>
              </div>
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={`/positions/${row.id}`} />}
                  className="w-full"
                >
                  {tCommon("edit")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CursorPagination
        firstId={firstId}
        lastId={lastId}
        hasNext={hasNext}
        hasPrev={hasPrev}
        pageSize={pageSize}
      />
    </div>
  );
}
