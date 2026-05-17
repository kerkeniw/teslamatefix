"use client";

import { useActionState } from "react";
import { loginAction, type LoginActionResult } from "./actions";

export function LoginForm({ from }: { from?: string }) {
  const [state, formAction, pending] = useActionState<
    LoginActionResult | null,
    FormData
  >(loginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {from ? <input type="hidden" name="from" value={from} /> : null}
      <div className="space-y-1.5">
        <label
          htmlFor="username"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
        >
          Identifiant
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
        >
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </div>
      {state?.error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-[0.06em] text-primary-foreground shadow-sm transition-colors hover:bg-tesla-red-hover disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
