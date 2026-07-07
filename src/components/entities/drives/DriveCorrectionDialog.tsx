"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  DriveCorrectionSerialized,
  FkLabels,
} from "@/lib/integrity/drives";

type ComputeResult = {
  ok: boolean;
  error?: string;
  before?: DriveCorrectionSerialized;
  after?: DriveCorrectionSerialized;
  beforeLabels?: FkLabels;
  afterLabels?: FkLabels;
  positionCount?: number;
  absorbedPositionIds?: number[];
  absorbedCount?: number;
};

// Ordre d'affichage du diff.
const FIELD_KEYS = [
  "start_date",
  "end_date",
  "start_address_id",
  "end_address_id",
  "start_geofence_id",
  "end_geofence_id",
  "start_position_id",
  "end_position_id",
  "start_km",
  "end_km",
  "start_ideal_range_km",
  "end_ideal_range_km",
  "start_rated_range_km",
  "end_rated_range_km",
  "distance",
  "duration_min",
  "ascent",
  "descent",
  "speed_max",
  "power_max",
  "power_min",
  "outside_temp_avg",
  "inside_temp_avg",
] as const satisfies readonly (keyof DriveCorrectionSerialized)[];

// Champs FK affichés via un libellé (adresse/géofence) plutôt que l'id brut.
const LABEL_FIELDS: Partial<Record<(typeof FIELD_KEYS)[number], keyof FkLabels>> = {
  start_address_id: "start_address",
  end_address_id: "end_address",
  start_geofence_id: "start_geofence",
  end_geofence_id: "end_geofence",
};

type Loaded = {
  before: DriveCorrectionSerialized;
  after: DriveCorrectionSerialized;
  beforeLabels: FkLabels;
  afterLabels: FkLabels;
  positionCount: number;
  absorbedPositionIds: number[];
  absorbedCount: number;
};

/**
 * Popin de correction/recalcul d'un trajet : à l'ouverture, calcule l'aperçu
 * avant/après depuis les positions ; à l'application, écrit puis ferme et
 * rafraîchit la page. Rend son propre bouton déclencheur (« Corriger »).
 */
export function DriveCorrectionDialog({
  driveId,
  reasons,
  computeAction,
  applyAction,
}: {
  driveId: number;
  reasons: string[];
  computeAction: (id: number) => Promise<ComputeResult>;
  applyAction: (
    id: number,
    after: DriveCorrectionSerialized,
    absorbedPositionIds: number[],
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const t = useTranslations("drives.correction");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isComputing, startCompute] = useTransition();
  const [isApplying, startApply] = useTransition();
  const [result, setResult] = useState<Loaded | null>(null);

  function handleCompute() {
    startCompute(async () => {
      const r = await computeAction(driveId);
      if (!r.ok || !r.before || !r.after || !r.beforeLabels || !r.afterLabels) {
        toast.error(r.error ?? tCommon("errorOccurred"));
        return;
      }
      setResult({
        before: r.before,
        after: r.after,
        beforeLabels: r.beforeLabels,
        afterLabels: r.afterLabels,
        positionCount: r.positionCount ?? 0,
        absorbedPositionIds: r.absorbedPositionIds ?? [],
        absorbedCount: r.absorbedCount ?? 0,
      });
    });
  }

  // Auto-calcul de l'aperçu à l'ouverture (compute lance une transition async,
  // pas de setState synchrone dans l'effet).
  useEffect(() => {
    if (open && result == null) handleCompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setResult(null);
  }

  function handleApply() {
    if (!result) return;
    startApply(async () => {
      const r = await applyAction(driveId, result.after, result.absorbedPositionIds);
      if (!r.ok) {
        toast.error(r.error ?? tCommon("errorOccurred"));
        return;
      }
      toast.success(t("applied"));
      setResult(null);
      setOpen(false);
      router.refresh();
    });
  }

  function fmt(
    key: (typeof FIELD_KEYS)[number],
    value: string | number | null,
    labels: FkLabels,
  ): string {
    const labelKey = LABEL_FIELDS[key];
    if (labelKey) return labels[labelKey] ?? "—";
    if (value == null) return "—";
    if (key === "start_date" || key === "end_date") {
      return format.dateTime(new Date(value as string), "short");
    }
    return String(value);
  }

  function changed(key: (typeof FIELD_KEYS)[number]): boolean {
    if (!result) return false;
    const a = result.before[key];
    const b = result.after[key];
    if (a == null && b == null) return false;
    return a !== b;
  }

  const noPositions = result != null && result.positionCount === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <Wrench className="size-4" aria-hidden />
            {t("correct")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("recomputeTitle")}</DialogTitle>
          <DialogDescription>{t("recomputeDescription")}</DialogDescription>
        </DialogHeader>

        {reasons.length > 0 ? (
          <ul className="list-inside list-disc text-sm text-warn">
            {reasons.map((r) => (
              <li key={r}>{t(`reasons.${r}`)}</li>
            ))}
          </ul>
        ) : null}

        {isComputing && result == null ? (
          <p className="text-sm text-muted-foreground">{t("computing")}</p>
        ) : null}

        {noPositions ? (
          <p className="text-sm text-muted-foreground">{t("noPositions")}</p>
        ) : null}

        {result && !noPositions && result.absorbedCount > 0 ? (
          <p className="text-sm font-medium text-foreground">
            {t("absorbed", { count: result.absorbedCount })}
          </p>
        ) : null}

        {result && !noPositions ? (
          <div className="max-h-[55vh] overflow-auto rounded-md border">
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
                  const isChanged = changed(key);
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{t(`fields.${key}`)}</TableCell>
                      <TableCell className={isChanged ? "" : "text-muted-foreground"}>
                        {fmt(key, result.before[key], result.beforeLabels)}
                      </TableCell>
                      <TableCell
                        className={
                          isChanged ? "font-semibold text-foreground" : "text-muted-foreground"
                        }
                      >
                        {fmt(key, result.after[key], result.afterLabels)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline">{tCommon("cancel")}</Button>}
          />
          <Button
            type="button"
            onClick={handleApply}
            disabled={!result || noPositions || isApplying}
          >
            {isApplying ? tCommon("saving") : t("apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
