"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Check, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CursorPagination } from "@/components/data-table/cursor-pagination";
import { ConfirmDialog } from "@/components/tesla/confirm-dialog";

export type TickRow = {
  id: number;
  date: string;
  battery_level: number | null;
  usable_battery_level: number | null;
  charge_energy_added: string;
  charger_power: number;
  charger_voltage: number | null;
  charger_actual_current: number | null;
  charger_pilot_current: number | null;
  charger_phases: number | null;
  fast_charger_present: boolean | null;
  fast_charger_brand: string | null;
  fast_charger_type: string | null;
  conn_charge_cable: string | null;
  ideal_battery_range_km: string;
  rated_battery_range_km: string | null;
  outside_temp: string | null;
  battery_heater_on: boolean | null;
  battery_heater: boolean | null;
  battery_heater_no_power: boolean | null;
  not_enough_power_to_heat: boolean | null;
};

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function BoolCell({ v }: { v: boolean | null }) {
  if (v == null) return <Dash />;
  return v ? (
    <Check className="size-3.5 text-foreground" aria-label="oui" />
  ) : (
    <X className="size-3.5 text-muted-foreground" aria-label="non" />
  );
}

function TextCell({ v }: { v: string | null }) {
  return v ? <span>{v}</span> : <Dash />;
}

function NumCell({ v, suffix }: { v: number | string | null; suffix?: string }) {
  if (v == null || v === "") return <Dash />;
  return (
    <span>
      {v}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

export function TicksTable({
  ticks,
  total,
  firstId,
  lastId,
  hasNext,
  hasPrev,
  pageSize,
  deleteTickAction,
  readOnly,
}: {
  ticks: TickRow[];
  total: number;
  firstId: number | null;
  lastId: number | null;
  hasNext: boolean;
  hasPrev: boolean;
  pageSize: number;
  deleteTickAction: (id: number) => Promise<{ ok: boolean; error?: string }>;
  readOnly: boolean;
}) {
  const t = useTranslations("charges.ticksTab");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  async function handleDelete(id: number) {
    const r = await deleteTickAction(id);
    if (r.ok) {
      toast.success(tCommon("deleted"));
    } else {
      toast.error(r.error ?? tCommon("errorOccurred"));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("totalCount", { n: total })}</p>
      {ticks.length === 0 ? (
        <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">id</TableHead>
                <TableHead>{t("headers.date")}</TableHead>
                <TableHead>{t("headers.battery")}</TableHead>
                <TableHead>{t("headers.usableBattery")}</TableHead>
                <TableHead>{t("headers.energy")}</TableHead>
                <TableHead>{t("headers.power")}</TableHead>
                <TableHead>{t("headers.voltage")}</TableHead>
                <TableHead>{t("headers.current")}</TableHead>
                <TableHead>{t("headers.pilotCurrent")}</TableHead>
                <TableHead>{t("headers.phases")}</TableHead>
                <TableHead>{t("headers.fast")}</TableHead>
                <TableHead>{t("headers.chargerBrand")}</TableHead>
                <TableHead>{t("headers.chargerType")}</TableHead>
                <TableHead>{t("headers.cable")}</TableHead>
                <TableHead>{t("headers.idealRange")}</TableHead>
                <TableHead>{t("headers.ratedRange")}</TableHead>
                <TableHead>{t("headers.outsideTemp")}</TableHead>
                <TableHead>{t("headers.heaterOn")}</TableHead>
                <TableHead>{t("headers.heaterAvailable")}</TableHead>
                <TableHead>{t("headers.heaterNoPower")}</TableHead>
                <TableHead>{t("headers.notEnoughPower")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ticks.map((tk) => (
                <TableRow key={tk.id}>
                  <TableCell className="font-mono text-xs">{tk.id}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {format.dateTime(new Date(tk.date), "short")}
                  </TableCell>
                  <TableCell>
                    {tk.battery_level != null ? `${tk.battery_level}%` : <Dash />}
                  </TableCell>
                  <TableCell>
                    {tk.usable_battery_level != null ? (
                      `${tk.usable_battery_level}%`
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                  <TableCell>{tk.charge_energy_added}</TableCell>
                  <TableCell>{tk.charger_power}</TableCell>
                  <TableCell>
                    <NumCell v={tk.charger_voltage} />
                  </TableCell>
                  <TableCell>
                    <NumCell v={tk.charger_actual_current} />
                  </TableCell>
                  <TableCell>
                    <NumCell v={tk.charger_pilot_current} />
                  </TableCell>
                  <TableCell>
                    <NumCell v={tk.charger_phases} />
                  </TableCell>
                  <TableCell>
                    {tk.fast_charger_present ? (
                      <Badge variant="secondary">DC</Badge>
                    ) : tk.fast_charger_present === false ? (
                      <span className="text-xs text-muted-foreground">AC</span>
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                  <TableCell>
                    <TextCell v={tk.fast_charger_brand} />
                  </TableCell>
                  <TableCell>
                    <TextCell v={tk.fast_charger_type} />
                  </TableCell>
                  <TableCell>
                    <TextCell v={tk.conn_charge_cable} />
                  </TableCell>
                  <TableCell>
                    <NumCell v={tk.ideal_battery_range_km} suffix="km" />
                  </TableCell>
                  <TableCell>
                    <NumCell v={tk.rated_battery_range_km} suffix="km" />
                  </TableCell>
                  <TableCell>
                    <NumCell v={tk.outside_temp} suffix="°C" />
                  </TableCell>
                  <TableCell>
                    <BoolCell v={tk.battery_heater_on} />
                  </TableCell>
                  <TableCell>
                    <BoolCell v={tk.battery_heater} />
                  </TableCell>
                  <TableCell>
                    <BoolCell v={tk.battery_heater_no_power} />
                  </TableCell>
                  <TableCell>
                    <BoolCell v={tk.not_enough_power_to_heat} />
                  </TableCell>
                  <TableCell>
                    <ConfirmDialog
                      destructive
                      title={t("deleteOne.title")}
                      description={t("deleteOne.description", { id: tk.id })}
                      confirmLabel={t("deleteOne.confirm")}
                      cancelLabel={tCommon("cancel")}
                      onConfirm={() => handleDelete(tk.id)}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={readOnly}
                          aria-label={tCommon("delete")}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
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
