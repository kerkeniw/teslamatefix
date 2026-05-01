"use client";

import { useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/tesla/confirm-dialog";

export type DriveRecalcSerialized = {
  start_date: string | null;
  end_date: string | null;
  distance: number | null;
  duration_min: number | null;
  ascent: number | null;
  descent: number | null;
  speed_max: number | null;
};

const FIELD_KEYS = [
  "start_date",
  "end_date",
  "distance",
  "duration_min",
  "ascent",
  "descent",
  "speed_max",
] as const satisfies readonly (keyof DriveRecalcSerialized)[];

export function DriveRecalcPanel({
  driveId,
  computeAction,
  applyAction,
  readOnly,
}: {
  driveId: number;
  computeAction: (id: number) => Promise<{
    ok: boolean;
    error?: string;
    before?: DriveRecalcSerialized;
    after?: DriveRecalcSerialized;
  }>;
  applyAction: (
    id: number,
    after: DriveRecalcSerialized,
  ) => Promise<{ ok: boolean; error?: string }>;
  readOnly?: boolean;
}) {
  const t = useTranslations("drives.recalc");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [isComputing, startCompute] = useTransition();
  const [isApplying, startApply] = useTransition();
  const [result, setResult] = useState<
    | { before: DriveRecalcSerialized; after: DriveRecalcSerialized }
    | null
  >(null);

  function handleCompute() {
    startCompute(async () => {
      const r = await computeAction(driveId);
      if (!r.ok || !r.before || !r.after) {
        toast.error(r.error ?? tCommon("errorOccurred"));
        return;
      }
      setResult({ before: r.before, after: r.after });
    });
  }

  async function handleApply() {
    if (!result) return;
    startApply(async () => {
      const r = await applyAction(driveId, result.after);
      if (!r.ok) {
        toast.error(r.error ?? tCommon("errorOccurred"));
        return;
      }
      toast.success(t("applied"));
      setResult(null);
    });
  }

  function fmt(key: keyof DriveRecalcSerialized, value: string | number | null) {
    if (value == null) return "—";
    if (key === "start_date" || key === "end_date") {
      return format.dateTime(new Date(value as string), "short");
    }
    return String(value);
  }

  function eq(
    a: string | number | null | undefined,
    b: string | number | null | undefined,
  ) {
    if (a == null && b == null) return true;
    return a === b;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{t("title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleCompute}
          disabled={isComputing || readOnly}
        >
          {isComputing ? t("computing") : t("compute")}
        </Button>
        {result ? (
          <>
            <ConfirmDialog
              destructive
              title={t("applyConfirm.title")}
              description={t("applyConfirm.description")}
              confirmLabel={t("applyConfirm.confirm")}
              cancelLabel={tCommon("cancel")}
              onConfirm={handleApply}
              trigger={
                <Button type="button" disabled={isApplying || readOnly}>
                  {t("apply")}
                </Button>
              }
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setResult(null)}
              disabled={isApplying}
            >
              {t("discard")}
            </Button>
          </>
        ) : null}
      </div>
      {result ? (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("diff.field")}</TableHead>
                <TableHead>{t("diff.before")}</TableHead>
                <TableHead>{t("diff.after")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FIELD_KEYS.map((key) => {
                const same = eq(result.before[key], result.after[key]);
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium">
                      {t(`fields.${key}`)}
                    </TableCell>
                    <TableCell className={same ? "" : "text-muted-foreground"}>
                      {fmt(key, result.before[key])}
                    </TableCell>
                    <TableCell className={same ? "text-muted-foreground" : "font-semibold text-foreground"}>
                      {fmt(key, result.after[key])}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
