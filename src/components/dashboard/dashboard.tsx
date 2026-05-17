import { getFormatter, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  BatteryCharging,
  Car as CarIcon,
  ChevronRight,
  Plus,
} from "lucide-react";
import type { DashboardData } from "@/lib/dashboard";
import { Link } from "@/i18n/navigation";
import { ButtonLink } from "@/components/ui/button-link";
import { FirmwareLink } from "@/components/tesla/firmware-link";
import { STATE_TONES } from "@/components/entities/states/state-tones";
import { cn } from "@/lib/utils";

function StateBadge({
  state,
  label,
}: {
  state: "online" | "offline" | "asleep";
  label: string;
}) {
  const tone = STATE_TONES[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
        tone.bg,
        tone.text,
        tone.border,
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
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
  const formatShort = (iso: string) => format.dateTime(new Date(iso), "short");
  const anomalyCount = data.anomalies.length;

  return (
    <div className="space-y-6">
      {/* HERO — overview strip with subtle HUD grid background */}
      <section
        aria-labelledby="overview-title"
        className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm md:p-6"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:32px_32px]"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p
              id="overview-title"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              {t("statusLabel")}
            </p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight md:text-3xl">
              {car
                ? `${car.marketingName ?? car.model ?? "Tesla"}${car.name ? ` — ${car.name}` : ""}`
                : "Aucun véhicule"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {car?.vin ? (
                <span className="font-mono">VIN …{car.vin.slice(-6)}</span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                {t("firmware")} :{" "}
                <FirmwareLink version={data.firmwareVersion} />
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.currentState ? (
              <>
                <StateBadge
                  state={data.currentState.state}
                  label={data.currentState.state}
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {timeSince(data.currentState.sinceIso)}
                </span>
              </>
            ) : null}
            {anomalyCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-critical/35 bg-critical/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-critical shadow-[0_0_0_1px_color-mix(in_oklch,var(--critical)_30%,transparent),0_6px_14px_-4px_color-mix(in_oklch,var(--critical)_25%,transparent)]">
                <span className="size-1.5 rounded-full bg-critical" aria-hidden />
                {anomalyCount} {t("anomalies").toLowerCase()}
              </span>
            ) : null}
          </div>
        </div>

        {/* KPI grid — month counts */}
        <div className="relative mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-2">
          <div className="bg-card p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("drivesThisMonth")}
            </p>
            <Link
              href="/drives"
              className="mt-2 inline-flex items-baseline gap-2 font-mono text-3xl font-semibold tabular-nums hover:text-accent-blue"
            >
              {data.monthCounts.drives}
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </div>
          <div className="bg-card p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("chargesThisMonth")}
            </p>
            <Link
              href="/charges"
              className="mt-2 inline-flex items-baseline gap-2 font-mono text-3xl font-semibold tabular-nums hover:text-accent-blue"
            >
              {data.monthCounts.charges}
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* TWO-COL — Quick actions + Integrity */}
      <section className="grid gap-6 md:grid-cols-3">
        {/* Quick actions */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between border-b py-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("quickActions")}
            </h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <QuickCard
              icon={<BatteryCharging className="size-4 text-tesla-red" aria-hidden />}
              title={t("lastCharge")}
              primary={
                data.lastCharge ? formatShort(data.lastCharge.startDateIso) : "—"
              }
              secondary={
                data.lastCharge
                  ? `${
                      data.lastCharge.energyKwh != null
                        ? `${data.lastCharge.energyKwh.toFixed(1)} kWh`
                        : "—"
                    }${data.lastCharge.locationLabel ? ` · ${data.lastCharge.locationLabel}` : ""}`
                  : null
              }
              actionHref={
                data.lastCharge ? `/charges/${data.lastCharge.id}` : null
              }
              actionLabel={t("edit")}
            />
            <QuickCard
              icon={<CarIcon className="size-4 text-tesla-red" aria-hidden />}
              title={t("lastDrive")}
              primary={
                data.lastDrive ? formatShort(data.lastDrive.startDateIso) : "—"
              }
              secondary={
                data.lastDrive
                  ? `${
                      data.lastDrive.distanceKm != null
                        ? `${data.lastDrive.distanceKm.toFixed(1)} km`
                        : "—"
                    } · ${formatLocation(
                      data.lastDrive.startCity,
                      data.lastDrive.endCity,
                    )}`
                  : null
              }
              actionHref={
                data.lastDrive ? `/drives/${data.lastDrive.id}` : null
              }
              actionLabel={t("edit")}
            />
            <QuickCard
              icon={<Plus className="size-4 text-accent-blue" aria-hidden />}
              title={t("newCharge")}
              primary={t("create")}
              secondary={t("newChargeHint")}
              actionHref="/charges/new"
              actionLabel={t("create")}
              primaryAction
            />
            <QuickCard
              icon={<Plus className="size-4 text-accent-blue" aria-hidden />}
              title={t("newDrive")}
              primary={t("create")}
              secondary={t("newDriveHint")}
              actionHref="/drives/new"
              actionLabel={t("create")}
              primaryAction
            />
          </div>
        </div>

        {/* Integrity panel */}
        <aside>
          <div className="flex items-center justify-between border-b py-2">
            <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <AlertTriangle className="size-3.5 text-warn" aria-hidden />
              {t("anomalies")}
            </h2>
            {anomalyCount > 0 ? (
              <span className="font-mono text-[10px] text-muted-foreground">
                {anomalyCount}
              </span>
            ) : null}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
            {anomalyCount === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                <span className="block size-2 mx-auto mb-2 rounded-full bg-ok" />
                ✓
              </p>
            ) : (
              <ul className="divide-y">
                {data.anomalies.map((a) => (
                  <li key={`${a.kind}-${a.id}`}>
                    <Link
                      href={a.href as never}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-warn">
                          {tn(kindToNavKey(a.kind))}
                        </span>
                        <span className="truncate">{a.label}</span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                        {t("openSince", { time: timeSince(a.sinceIso) })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

function QuickCard({
  icon,
  title,
  primary,
  secondary,
  actionHref,
  actionLabel,
  primaryAction,
}: {
  icon: React.ReactNode;
  title: string;
  primary: string;
  secondary: string | null;
  actionHref: string | null;
  actionLabel: string;
  primaryAction?: boolean;
}) {
  return (
    <article className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
      <header className="flex items-center gap-2">
        {icon}
        <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h3>
      </header>
      <p className="mt-3 text-sm font-medium">{primary}</p>
      {secondary ? (
        <p className="mt-1 text-xs text-muted-foreground">{secondary}</p>
      ) : null}
      {actionHref ? (
        <div className="mt-4">
          <ButtonLink
            href={actionHref}
            variant={primaryAction ? "default" : "outline"}
            size="sm"
            className="w-full"
          >
            {actionLabel}
          </ButtonLink>
        </div>
      ) : null}
    </article>
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
