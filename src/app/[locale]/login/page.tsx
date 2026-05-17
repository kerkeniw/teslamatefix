import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: {
  searchParams: Promise<{ from?: string }>;
}) {
  if (await isAuthenticated()) {
    redirect("/");
  }
  const { from } = await props.searchParams;
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-muted p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:32px_32px]"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            console
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            TeslaMateFix
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connectez-vous pour accéder à la console.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <LoginForm from={from} />
        </div>
      </div>
    </div>
  );
}
