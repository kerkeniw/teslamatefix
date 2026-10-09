import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { PageHeader } from "@/components/app-shell/page-header";
import { UpdateForm } from "@/components/entities/updates/UpdateForm";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeft } from "lucide-react";
import { updateUpdateAction, deleteUpdateAction } from "../actions";

export default async function UpdateEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: idStr } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations("updates");
  const tCommon = await getTranslations("common");

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const [update, cars] = await Promise.all([
    prisma.updates.findUnique({ where: { id } }),
    prisma.cars.findMany({
      select: { id: true, name: true, vin: true, model: true },
      orderBy: { id: "asc" },
    }),
  ]);

  if (!update) notFound();

  const carOptions = cars.map((c) => ({
    id: c.id,
    label: c.name ?? c.vin ?? c.model ?? `#${c.id}`,
  }));

  const boundUpdate = updateUpdateAction.bind(null, id);
  const boundDelete = deleteUpdateAction.bind(null, id);

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <ButtonLink variant="ghost" size="sm" href="/updates">
            <ArrowLeft className="size-4" aria-hidden />
            {tCommon("back")}
          </ButtonLink>
        </div>
        <PageHeader title={t("edit")} id={update.id} />
        <UpdateForm
          mode="edit"
          id={update.id}
          cars={carOptions}
          readOnly={env.READ_ONLY}
          saveAction={boundUpdate}
          deleteAction={boundDelete}
          initial={{
            start_date: update.start_date.toISOString(),
            end_date: update.end_date ? update.end_date.toISOString() : "",
            version: update.version ?? "",
            car_id: String(update.car_id),
          }}
        />
      </main>
    </>
  );
}
