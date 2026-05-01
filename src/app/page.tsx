import { requireSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";

export default async function Home() {
  await requireSession();

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">
            Tableau de bord
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Étapes 5–9 du plan : i18n, entités, dashboard avec firmware et
            anomalies. Le shell, le thème Tesla et les composants partagés
            (DataTable, Form, ConfirmDialog, FirmwareLink) sont en place.
          </p>
        </div>
      </main>
    </>
  );
}
