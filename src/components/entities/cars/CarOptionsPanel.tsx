"use client";

import { useTranslations } from "next-intl";

export type CarOptionsData = {
  /** Attributs pertinents lus dans la table `cars`. */
  db: {
    model: string | null;
    marketingName: string | null;
    trimBadging: string | null;
    exteriorColor: string | null;
    spoilerType: string | null;
    wheelType: string | null;
  };
  /** Réponse Fleet API mise en cache (payload complet + codes extraits). */
  api: { codes: string[]; payload: unknown; fetchedAt: string } | null;
  /** Contenu brut de la variable d'environnement `TESLA_VEHICLE_OPTIONS`. */
  envOptions: string | null;
};

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="text-base font-semibold">{title}</h3>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Onglet « Options » de l'écran véhicule : présentation en lecture seule des trois
 * sources d'information sur l'équipement du véhicule — la base TeslaMate, la réponse
 * de la Fleet API mise en cache, et la variable d'environnement de repli.
 */
export function CarOptionsPanel({ data }: { data: CarOptionsData }) {
  const t = useTranslations("cars");
  const { db, api, envOptions } = data;

  return (
    <div className="space-y-4">
      <Section title={t("options.fromDb")}>
        <dl className="divide-y">
          <Row label={t("fields.model")} value={db.model} />
          <Row label={t("fields.marketingName")} value={db.marketingName} />
          <Row label={t("fields.trimBadging")} value={db.trimBadging} />
          <Row label={t("fields.exteriorColor")} value={db.exteriorColor} />
          <Row label={t("fields.spoilerType")} value={db.spoilerType} />
          <Row label={t("fields.wheelType")} value={db.wheelType} />
        </dl>
      </Section>

      <Section title={t("options.fromApi")} hint={t("options.fromApiHint")}>
        {api ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("options.fetchedAt")} : {api.fetchedAt}
            </p>
            {api.codes.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {api.codes.map((c) => (
                  <li
                    key={c}
                    className="rounded-full border bg-muted px-2 py-0.5 font-mono text-[11px]"
                  >
                    ${c}
                  </li>
                ))}
              </ul>
            ) : null}
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {t("options.rawResponse")}
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(api.payload, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("options.apiUnavailable")}</p>
        )}
      </Section>

      <Section title={t("options.fromEnv")} hint={t("options.fromEnvHint")}>
        {envOptions?.trim() ? (
          <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11px]">
            {envOptions}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">{t("options.envUnset")}</p>
        )}
      </Section>
    </div>
  );
}
