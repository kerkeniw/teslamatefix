import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { redirect } from "@/i18n/navigation";

function CarPlaceholder() {
  return (
    <svg
      viewBox="0 0 64 32"
      aria-hidden
      className="h-12 w-24 text-muted-foreground"
      fill="currentColor"
    >
      <path d="M8 22h2a4 4 0 0 0 8 0h28a4 4 0 0 0 8 0h2v-4l-3-2-5-8H16l-5 8-3 2v4Zm6-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm36 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM18 10h26l4 6H14l4-6Z" />
    </svg>
  );
}

export default async function CarsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("cars");

  const cars = await prisma.cars.findMany({
    orderBy: [{ display_priority: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      vin: true,
      model: true,
      marketing_name: true,
      trim_badging: true,
      car_settings: { select: { enabled: true } },
    },
  });

  // Cas le plus fréquent (mono-voiture) : on saute la liste pour aller direct
  // à la page d'édition. La liste reste accessible si l'utilisateur ajoute
  // une seconde voiture plus tard.
  if (cars.length === 1) {
    redirect({ href: `/cars/${cars[0].id}`, locale });
  }

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>

        {cars.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cars.map((c) => {
              const enabled = c.car_settings?.enabled ?? true;
              const vinShort = c.vin ? `…${c.vin.slice(-6)}` : null;
              return (
                <Card key={c.id} size="sm">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="line-clamp-1">
                        {c.name ?? c.marketing_name ?? c.model ?? `#${c.id}`}
                      </CardTitle>
                      <Badge variant={enabled ? "default" : "secondary"}>
                        {enabled ? t("enabled") : t("disabled")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <CarPlaceholder />
                      <div className="text-right text-xs text-muted-foreground">
                        {c.model ? <div>{c.model}</div> : null}
                        {c.trim_badging ? <div>{c.trim_badging}</div> : null}
                        {vinShort ? <div className="font-mono">{vinShort}</div> : null}
                      </div>
                    </div>
                    <ButtonLink
                      size="sm"
                      variant="outline"
                      href={`/cars/${c.id}`}
                      className="w-full"
                    >
                      {t("edit")}
                    </ButtonLink>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
