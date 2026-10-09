"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  importChargingCsvAction,
  type PrivacyImportState,
} from "@/app/[locale]/privacy/actions";

export function PrivacyImportForm() {
  const t = useTranslations("privacy");
  const [state, formAction, pending] = useActionState<PrivacyImportState | null, FormData>(
    importChargingCsvAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(t("import.done", { n: state.sessions ?? 0, added: state.added ?? 0 }));
    }
  }, [state, t]);

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        className="sm:max-w-md"
        aria-label={t("import.file")}
      />
      <Button type="submit" disabled={pending}>
        <Upload className="size-4" aria-hidden />
        {pending ? t("import.pending") : t("import.submit")}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
