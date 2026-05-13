import { getFormatter, getTranslations } from "next-intl/server";
import { AlertTriangle, BatteryCharging, Car, Plus } from "lucide-react";
import type { DashboardData } from "@/lib/dashboard";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FirmwareLink } from "@/components/tesla/firmware-link";

function StateBadge({ state }: { state: "online" | "offline" | "asleep" }) {
  const map = {
    online: { className: "bg-green-100 text-green-800", label: "🟢 online" },
    asleep: { className: "bg-zinc-100 text-zinc-700", label: "💤 asleep" },
    offline: { className: "bg-red-100 text-red-700", label: "⚫ offline" },
  } as const;
  const { className, label } = map[state];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "à l'instant";
  if (ms < 3_600_000) return `il y a ${Math.floor(ms / 60_000)} min`;
  if (ms < 86_400_000) return `il y a ${Math.floor(ms / 3_600_000)} h`;
  const days = Math.floor(ms / 86_400_000);
  return `il y a ${days} j`;
}

function formatLocation(start: string | null, end: string | null): string {
  if (start && end && start !== end) return `${start} → ${end}`;
  return start ?? end ?? "—";
}

export async function Dashboard({ data }: { data: DashboardData }) {
  const t = await getTranslations("dashboard");
  const tn = await getTranslations("nav");
  const format = await getFormatter();

  const car = data.car;
  const formatShort = (iso: string) =>
    format.dateTime(new Date(iso), "short");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">
            {car
              ? `${car.marketingName ?? car.model ?? "Tesla"}${car.name ? ` — ${car.name}` : ""}`
              : "Aucun véhicule"}
          </CardTitle>
          {car?.vin ? (
            <p className="text-xs text-muted-foreground">
              VIN …{car.vin.slice(-6)}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{t("statusLabel")} :</span>
            {data.currentState ? (
              <>
                <StateBadge state={data.currentState.state} />
                <span className="text-xs text-muted-foreground">
                  {timeSince(data.currentState.sinceIso)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{t("firmware")} :</span>
            <FirmwareLink version={data.firmwareVersion} />
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="quick-actions-title" className="space-y-2">
        <h2
          id="quick-actions-title"
          className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("quickActions")}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="flex flex-col">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <BatteryCharging className="size-5 text-tesla-red" aria-hidden />
              <CardTitle className="text-sm">{t("lastCharge")}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-1 text-sm">
              {data.lastCharge ? (
                <>
                  <p>{formatShort(data.lastCharge.startDateIso)}</p>
                  <p className="text-muted-foreground">
                    {data.lastCharge.energyKwh != null
                      ? `${data.lastCharge.energyKwh.toFixed(1)} kWh`
                      : "—"}
                    {data.lastCharge.locationLabel
                      ? ` · ${data.lastCharge.locationLabel}`
                      : ""}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </CardContent>
            <div className="p-4 pt-0">
              {data.lastCharge ? (
                <Link href={`/charges/${data.lastCharge.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    {t("edit")}
                  </Button>
                </Link>
              ) : null}
            </div>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Car className="size-5 text-tesla-red" aria-hidden />
              <CardTitle className="text-sm">{t("lastDrive")}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-1 text-sm">
              {data.lastDrive ? (
                <>
                  <p>{formatShort(data.lastDrive.startDateIso)}</p>
                  <p className="text-muted-foreground">
                    {data.lastDrive.distanceKm != null
                      ? `${data.lastDrive.distanceKm.toFixed(1)} km`
                      : "—"}
                    {" · "}
                    {formatLocation(
                      data.lastDrive.startCity,
                      data.lastDrive.endCity,
                    )}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </CardContent>
            <div className="p-4 pt-0">
              {data.lastDrive ? (
                <Link href={`/drives/${data.lastDrive.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    {t("edit")}
                  </Button>
                </Link>
              ) : null}
            </div>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Plus className="size-5 text-tesla-red" aria-hidden />
              <CardTitle className="text-sm">{t("newCharge")}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 text-sm text-muted-foreground">
              {t("newChargeHint")}
            </CardContent>
            <div className="p-4 pt-0">
              <Link href="/charges/new">
                <Button variant="outline" size="sm" className="w-full">
                  {t("create")}
                </Button>
              </Link>
            </div>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Plus className="size-5 text-tesla-red" aria-hidden />
              <CardTitle className="text-sm">{t("newDrive")}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 text-sm text-muted-foreground">
              {t("newDriveHint")}
            </CardContent>
            <div className="p-4 pt-0">
              <Link href="/drives/new">
                <Button variant="outline" size="sm" className="w-full">
                  {t("create")}
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>

      <section aria-labelledby="summary-title" className="space-y-2">
        <h2
          id="summary-title"
          className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("summary")}
        </h2>
        <Card>
          <CardContent className="grid gap-3 py-4 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">{t("drivesThisMonth")} : </span>
              <Link
                href="/drives"
                className="font-medium text-tesla-red underline-offset-4 hover:underline"
              >
                {data.monthCounts.drives}
              </Link>
            </div>
            <div>
              <span className="text-muted-foreground">{t("chargesThisMonth")} : </span>
              <Link
                href="/charges"
                className="font-medium text-tesla-red underline-offset-4 hover:underline"
              >
                {data.monthCounts.charges}
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      {data.anomalies.length > 0 ? (
        <section aria-labelledby="anomalies-title" className="space-y-2">
          <h2
            id="anomalies-title"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <AlertTriangle className="size-4 text-amber-500" aria-hidden />
            {t("anomalies")}
          </h2>
          <Card>
            <CardContent className="divide-y p-0">
              {data.anomalies.map((a) => (
                <Link
                  key={`${a.kind}-${a.id}`}
                  href={a.href as never}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{tn(kindToNavKey(a.kind))}</Badge>
                    <span>{a.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t("openSince", { time: timeSince(a.sinceIso) })}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function kindToNavKey(
  kind: "openDrive" | "openChargingProcess" | "openState",
): "drives" | "charges" | "states" {
  switch (kind) {
    case "openDrive":
      return "drives";
    case "openChargingProcess":
      return "charges";
    case "openState":
      return "states";
  }
}
