import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { GeofenceForm } from "@/components/entities/geofences/GeofenceForm";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { updateGeofenceAction, deleteGeofenceAction } from "../actions";

export default async function GeofenceEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: idStr } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("geofences");
  const tCommon = await getTranslations("common");

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const [geofence, drivesCount, chargingCount] = await Promise.all([
    prisma.geofences.findUnique({ where: { id } }),
    prisma.drives.count({
      where: {
        OR: [{ start_geofence_id: id }, { end_geofence_id: id }],
      },
    }),
    prisma.charging_processes.count({ where: { geofence_id: id } }),
  ]);

  if (!geofence) notFound();

  const boundUpdate = updateGeofenceAction.bind(null, id);
  const boundDelete = deleteGeofenceAction.bind(null, id);

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <Button variant="ghost" size="sm" render={<Link href="/geofences" />}>
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </Button>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("edit")}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">#{geofence.id}</p>
        </header>
        <GeofenceForm
          mode="edit"
          id={geofence.id}
          drivesCount={drivesCount}
          chargingCount={chargingCount}
          readOnly={env.READ_ONLY}
          saveAction={boundUpdate}
          deleteAction={boundDelete}
          initial={{
            name: geofence.name,
            latitude: geofence.latitude.toString(),
            longitude: geofence.longitude.toString(),
            radius: String(geofence.radius),
            billing_type: geofence.billing_type,
            cost_per_unit: geofence.cost_per_unit ? geofence.cost_per_unit.toString() : "",
            session_fee: geofence.session_fee ? geofence.session_fee.toString() : "",
          }}
        />
      </main>
    </>
  );
}
