import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import {
  ChargeCreateClient,
  type PositionOption,
} from "@/components/entities/charges/ChargeCreateClient";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { createChargeAction } from "../actions";

const POSITION_LIST_LIMIT = 50;

function carLabel(c: { id: number; name: string | null; vin: string | null; model: string | null }): string {
  return c.name ?? c.vin ?? c.model ?? `#${c.id}`;
}

export default async function NewChargePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("charges");
  const tCommon = await getTranslations("common");

  const cars = await prisma.cars.findMany({
    select: { id: true, name: true, vin: true, model: true },
    orderBy: { id: "asc" },
  });
  const carOptions = cars.map((c) => ({ id: c.id, label: carLabel(c) }));

  // Pré-charge des dernières N positions par véhicule pour le sélecteur. C'est
  // borné (cars * 50) donc raisonnable même avec plusieurs voitures.
  const positionsByCar: Record<number, PositionOption[]> = {};
  await Promise.all(
    cars.map(async (c) => {
      const ps = await prisma.positions.findMany({
        where: { car_id: c.id },
        orderBy: { id: "desc" },
        take: POSITION_LIST_LIMIT,
        select: { id: true, date: true, latitude: true, longitude: true },
      });
      positionsByCar[c.id] = ps.map((p) => ({
        id: p.id,
        car_id: c.id,
        label: `#${p.id} — ${p.date.toISOString().slice(0, 16).replace("T", " ")} (${p.latitude.toString()}, ${p.longitude.toString()})`,
      }));
    }),
  );

  return (
    <>
      <AppHeader rightSlot={<LocaleSwitcher />} />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/charges">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("create")}</h1>
        </header>
        <ChargeCreateClient
          cars={carOptions}
          positionsByCar={positionsByCar}
          readOnly={env.READ_ONLY}
          createAction={createChargeAction}
        />
      </main>
    </>
  );
}
