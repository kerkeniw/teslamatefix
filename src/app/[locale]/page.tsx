import { setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { AppHeader } from "@/components/app-shell/header";
import { MainNav } from "@/components/app-shell/main-nav";
import { Dashboard } from "@/components/dashboard/dashboard";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const data = await getDashboardData();

  return (
    <>
      <AppHeader />
      <MainNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-8">
        <Dashboard data={data} />
      </main>
    </>
  );
}
