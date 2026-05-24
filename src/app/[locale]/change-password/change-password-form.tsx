"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  changePasswordAction,
  type ChangePasswordState,
} from "./actions";

const knownErrorKeys = new Set([
  "currentPasswordIncorrect",
  "passwordMismatch",
  "tooShort",
  "tooSimple",
  "envLocked",
]);

export function ChangePasswordForm() {
  const t = useTranslations("changePassword");
  const [state, formAction, pending] = useActionState<
    ChangePasswordState | null,
    FormData
  >(changePasswordAction, null);

  // Affiche une erreur globale (ex. envLocked) en toast.
  useEffect(() => {
    if (state?.error && knownErrorKeys.has(state.error)) {
      toast.error(t(`errors.${state.error}`));
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, t]);

  const fe = state?.fieldErrors ?? {};
  const fieldError = (k: string) =>
    knownErrorKeys.has(fe[k] ?? "") ? t(`errors.${fe[k]}`) : fe[k];

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="current_password"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
        >
          {t("currentPassword")}
        </label>
        <input
          id="current_password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        {fieldError("current_password") ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldError("current_password")}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="new_password"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
        >
          {t("newPassword")}
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        <p className="text-[11px] text-muted-foreground">
          {t("rules.minLength")} {t("rules.complexity")}
        </p>
        {fieldError("new_password") ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldError("new_password")}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="confirm_password"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
        >
          {t("confirmPassword")}
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        {fieldError("confirm_password") ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldError("confirm_password")}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-[0.06em] text-primary-foreground shadow-sm transition-colors hover:bg-tesla-red-hover disabled:opacity-60"
      >
        {pending ? t("saving") : t("submit")}
      </button>
    </form>
  );
}
