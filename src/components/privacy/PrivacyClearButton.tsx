"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/tesla/confirm-dialog";
import { clearPrivacyImportAction } from "@/app/[locale]/privacy/actions";

export function PrivacyClearButton() {
  const t = useTranslations("privacy");
  const tCommon = useTranslations("common");

  async function handleClear() {
    const r = await clearPrivacyImportAction();
    if (r.ok) toast.success(t("clear.done"));
    else toast.error(r.error ?? tCommon("errorOccurred"));
  }

  return (
    <ConfirmDialog
      destructive
      title={t("clear.title")}
      description={t("clear.description")}
      confirmLabel={t("clear.confirm")}
      cancelLabel={tCommon("cancel")}
      onConfirm={handleClear}
      trigger={
        <Button type="button" variant="outline" size="sm">
          <Trash2 className="size-4" aria-hidden />
          {t("clear.button")}
        </Button>
      }
    />
  );
}
