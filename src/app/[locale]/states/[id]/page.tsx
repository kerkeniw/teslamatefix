import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { StateForm } from "@/components/entities/states/StateForm";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { updateStateAction, deleteStateAction } from "../actions";

export default async function StateEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: idStr } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("states");
  const tCommon = await getTranslations("common");

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const [state, cars, openStates] = await Promise.all([
    prisma.states.findUnique({ where: { id } }),
    prisma.cars.findMany({
      select: { id: true, name: true, vin: true, model: true },
      orderBy: { id: "asc" },
    }),
    prisma.states.findMany({
      where: { end_date: null },
      select: { id: true, car_id: true },
    }),
  ]);
  if (!state) notFound();

  const carOptions = cars.map((c) => ({
    id: c.id,
    label: c.name ?? c.vin ?? c.model ?? `#${c.id}`,
  }));
  const openStatesByCar: Record<number, number> = {};
  for (const s of openStates) openStatesByCar[s.car_id] = s.id;

  const boundUpdate = updateStateAction.bind(null, id);
  const boundDelete = deleteStateAction.bind(null, id);

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/states">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("edit")}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">#{state.id}</p>
        </header>
        <StateForm
          mode="edit"
          id={state.id}
          cars={carOptions}
          openStates={openStatesByCar}
          currentStateId={state.id}
          readOnly={env.READ_ONLY}
          saveAction={boundUpdate}
          deleteAction={boundDelete}
          initial={{
            state: state.state,
            start_date: state.start_date.toISOString(),
            end_date: state.end_date ? state.end_date.toISOString() : "",
            car_id: String(state.car_id),
            close_previous: false,
          }}
        />
      </main>
    </>
  );
}
