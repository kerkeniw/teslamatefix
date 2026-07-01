"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CarForm, type CarFormValues } from "./CarForm";
import { CarSettingsForm, type CarSettingsValues } from "./CarSettingsForm";
import { CarOptionsPanel, type CarOptionsData } from "./CarOptionsPanel";

/**
 * Écran véhicule en **lecture seule** : `cars` et `car_settings` sont des données
 * système, collectées automatiquement ou modifiables dans TeslaMate. TeslaMateFix
 * se contente de les présenter — aucun champ n'est éditable, aucun enregistrement.
 */
export function CarEditClient({
  carInitial,
  settingsInitial,
  optionsData,
}: {
  carInitial: CarFormValues;
  settingsInitial: CarSettingsValues;
  optionsData: CarOptionsData;
}) {
  const t = useTranslations("cars");

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{t("readOnlyNotice")}</span>
      </div>

      <Tabs defaultValue="vehicle" className="w-full">
        <TabsList>
          <TabsTrigger value="vehicle">{t("tabs.vehicle")}</TabsTrigger>
          <TabsTrigger value="settings">{t("tabs.settings")}</TabsTrigger>
          <TabsTrigger value="options">{t("tabs.options")}</TabsTrigger>
        </TabsList>
        <TabsContent value="vehicle" className="pt-4">
          <CarForm initial={carInitial} readOnly />
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <CarSettingsForm initial={settingsInitial} readOnly />
        </TabsContent>
        <TabsContent value="options" className="pt-4">
          <CarOptionsPanel data={optionsData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
