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
        <label htmlFor="username" className="text-sm font-medium">
          Identifiant
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#E31937] focus:outline-none focus:ring-2 focus:ring-[#E31937]/20"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#E31937] focus:outline-none focus:ring-2 focus:ring-[#E31937]/20"
        />
      </div>
      {state?.error ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[#E31937] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#c5152f] disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
