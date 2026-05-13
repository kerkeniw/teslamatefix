"use client";

import { useTranslations, useFormatter } from "next-intl";
import { ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ButtonLink } from "@/components/ui/button-link";

export type ChildPosition = {
  id: number;
  date: string;
  latitude: string;
  longitude: string;
  speed: number | null;
  battery_level: number | null;
};

export function ChildrenPositionsTable({
  driveId,
  positions,
  total,
}: {
  driveId: number;
  positions: ChildPosition[];
  total: number;
}) {
  const t = useTranslations("drives");
  const tPos = useTranslations("positions");
  const format = useFormatter();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("positionsTab.totalCount", { n: total })}
        </p>
        <ButtonLink
          size="sm"
          variant="outline"
          href={`/positions?drive_id=${driveId}`}
        >
          {t("positionsTab.viewAll")}
        </ButtonLink>
      </div>
      {positions.length === 0 ? (
        <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          {t("positionsTab.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">id</TableHead>
                <TableHead>{tPos("fields.date")}</TableHead>
                <TableHead>{tPos("fields.latitude")}</TableHead>
                <TableHead>{tPos("fields.longitude")}</TableHead>
                <TableHead>{tPos("fields.speed")}</TableHead>
                <TableHead>{tPos("fields.batteryLevel")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell>{format.dateTime(new Date(p.date), "short")}</TableCell>
                  <TableCell className="font-mono text-xs">{p.latitude}</TableCell>
                  <TableCell className="font-mono text-xs">{p.longitude}</TableCell>
                  <TableCell>{p.speed ?? "—"}</TableCell>
                  <TableCell>
                    {p.battery_level != null ? `${p.battery_level}%` : "—"}
                  </TableCell>
                  <TableCell>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}&zoom=15`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3" aria-hidden />
                      {tPos("openOsm")}
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
