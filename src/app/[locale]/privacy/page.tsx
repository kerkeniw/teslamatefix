import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { ExternalLink, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Link } from "@/i18n/navigation";
import { PrivacyImportForm } from "@/components/privacy/PrivacyImportForm";
import { PrivacyClearButton } from "@/components/privacy/PrivacyClearButton";
import { readPrivacyStore } from "@/lib/privacy/store";
import { buildChargeReport } from "@/lib/privacy/report";
import type { CompareGroup, CompareKind } from "@/lib/privacy/compare";

const SECTIONS: CompareKind[] = ["missing", "fragmented", "energy_mismatch", "extra", "ok"];

/** Lien vers l'assistant de création pré-rempli depuis les sessions Tesla du groupe. */
function createHref(g: CompareGroup): string {
  const q = new URLSearchParams({
    start: g.tesla[0]?.start ?? g.start,
    end: g.tesla[g.tesla.length - 1]?.end ?? g.end,
    added: String(g.teslaKwh),
    type: g.teslaKind ?? "AC",
  });
  return `/charges/new?${q.toString()}`;
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("privacy");
  const format = await getFormatter();

  const store = readPrivacyStore();
  const report = store.sessions.length ? await buildChargeReport(store.sessions) : null;

  const dt = (iso: string) => format.dateTime(new Date(iso), "short");
  const kwh = (v: number | null) =>
    v == null ? "—" : `${format.number(v, { maximumFractionDigits: 2 })} kWh`;

  const groupRow = (g: CompareGroup) => (
      <li
        key={`${g.start}-${g.tm.map((s) => s.id).join("+")}`}
        className="flex flex-col gap-2 rounded-lg border bg-background p-3 text-sm md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs tabular-nums">
              {dt(g.start)} → {dt(g.end)}
            </span>
            {g.teslaKind ? <Badge variant="outline">{g.teslaKind}</Badge> : null}
            {g.severity === "info" && g.kind !== "ok" ? (
              <Badge variant="secondary">{t("minor")}</Badge>
            ) : null}
            {g.dateShiftMin != null ? (
              <Badge variant="secondary">{t("dateShift", { min: g.dateShiftMin })}</Badge>
            ) : null}
          </div>
          <div className="grid gap-x-6 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <span className="font-medium text-foreground">{t("tesla")}</span>{" "}
              {g.tesla.length
                ? `${kwh(g.teslaKwh)} · ${t("sessions", { n: g.tesla.length })} · ${[
                    ...new Set(g.tesla.map((s) => s.location)),
                  ].join(", ")}`
                : "—"}
            </div>
            <div>
              <span className="font-medium text-foreground">{t("teslamate")}</span>{" "}
              {g.tm.length ? (
                <>
                  {kwh(g.tmKwh)} ·{" "}
                  {g.tm.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 ? " + " : ""}
                      <Link
                        href={`/charges/${s.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        #{s.id}
                      </Link>
                      {s.open ? ` (${t("open")})` : ""}
                    </span>
                  ))}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          {g.kind !== "ok" ? (
            <p className="text-xs">
              {t(`advice.${g.kind}${g.kind === "extra" && g.emptyExtra ? "Empty" : ""}`, {
                tesla: kwh(g.teslaKwh),
                diff: kwh(g.diffKwh),
              })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {g.kind === "missing" ? (
            <ButtonLink size="sm" href={createHref(g)}>
              <Plus className="size-4" aria-hidden />
              {t("actions.create")}
            </ButtonLink>
          ) : null}
          {g.kind !== "missing" && g.kind !== "ok"
            ? g.tm.map((s) => (
                <ButtonLink key={s.id} size="sm" variant="outline" href={`/charges/${s.id}`}>
                  <ExternalLink className="size-4" aria-hidden />
                  {t("actions.open", { id: s.id })}
                </ButtonLink>
              ))
            : null}
        </div>
      </li>
  );

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>

        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">{t("import.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("import.help")}</p>
          <div className="mt-3">
            <PrivacyImportForm />
          </div>
          {store.imports.length ? (
            <div className="mt-4 space-y-1 border-t pt-3 text-xs text-muted-foreground">
              {store.imports.map((imp) => (
                <div key={imp.importedAt}>
                  {t("import.entry", {
                    date: dt(imp.importedAt),
                    file: imp.fileName,
                    n: imp.sessions,
                    added: imp.added,
                    from: imp.from ? dt(imp.from) : "—",
                    to: imp.to ? dt(imp.to) : "—",
                  })}
                </div>
              ))}
              <div className="pt-2">
                <PrivacyClearButton />
              </div>
            </div>
          ) : null}
        </section>

        {report ? (
          <>
            {env.READ_ONLY ? (
              <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
                {t("readOnly")}
              </div>
            ) : null}
            {report.unknownVins.length ? (
              <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
                {t("unknownVins", { vins: report.unknownVins.join(", ") })}
              </div>
            ) : null}

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {SECTIONS.map((k) => (
                <a
                  key={k}
                  href={`#${k}`}
                  className="rounded-xl border bg-card p-3 shadow-sm hover:border-foreground/20"
                >
                  <div className="text-xs text-muted-foreground">{t(`kinds.${k}`)}</div>
                  <div className="font-mono text-2xl tabular-nums">{report.counts[k]}</div>
                </a>
              ))}
            </section>
            <p className="text-sm">
              {report.toFix
                ? t("toFix", { n: report.toFix })
                : t("allGood")}
            </p>

            {SECTIONS.map((k) => {
              const groups = report.groups.filter((g) => g.kind === k);
              if (!groups.length) return null;
              const body = (
                <ul className="mt-3 space-y-2">
                  {groups.map(groupRow)}
                </ul>
              );
              return (
                <section
                  key={k}
                  id={k}
                  className="scroll-mt-20 rounded-xl border bg-card p-4 shadow-sm"
                >
                  {k === "ok" ? (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold">
                        {t(`kinds.${k}`)} ({groups.length})
                      </summary>
                      {body}
                    </details>
                  ) : (
                    <>
                      <h2 className="text-sm font-semibold">
                        {t(`kinds.${k}`)} ({groups.length})
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(`kindsHelp.${k}`)}
                      </p>
                      {body}
                    </>
                  )}
                </section>
              );
            })}
          </>
        ) : (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}
      </main>
    </>
  );
}
