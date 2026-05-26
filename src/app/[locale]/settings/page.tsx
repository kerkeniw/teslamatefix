import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { SettingsForm } from "@/components/entities/settings/SettingsForm";
import { updateSettingsAction } from "./actions";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("settings");

  // Singleton id=1 — TeslaMate l'initialise lors du premier démarrage.
  const row = await prisma.settings.findUnique({ where: { id: 1 } });

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>
        {row ? (
          <SettingsForm
            readOnly={env.READ_ONLY}
            saveAction={updateSettingsAction}
            initial={{
              unit_of_length: row.unit_of_length,
              unit_of_temperature: row.unit_of_temperature,
              unit_of_pressure: row.unit_of_pressure,
              preferred_range: row.preferred_range,
              language: row.language,
              base_url: row.base_url ?? "",
              grafana_url: row.grafana_url ?? "",
            }}
          />
        ) : (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            La ligne <code>settings (id=1)</code> est introuvable. Cette ligne est créée par
            TeslaMate au premier démarrage : vérifier que le service principal a bien tourné.
          </div>
        )}
      </main>
    </>
  );
}
