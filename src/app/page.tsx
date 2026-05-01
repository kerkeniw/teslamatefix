import { requireSession } from "@/lib/auth";

export default async function Home() {
  const session = await requireSession();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">TeslaMateFix</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Connecté en tant que <strong>{session.userId}</strong>. Le shell, le
          thème Tesla et les écrans métier seront ajoutés dans les étapes
          suivantes du plan.
        </p>
      </div>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          Se déconnecter
        </button>
      </form>
    </main>
  );
}
