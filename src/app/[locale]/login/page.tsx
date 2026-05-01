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
    <div className="flex min-h-svh items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">TeslaMateFix</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Connectez-vous pour accéder à la console.
          </p>
        </div>
        <LoginForm from={from} />
      </div>
    </div>
  );
}
