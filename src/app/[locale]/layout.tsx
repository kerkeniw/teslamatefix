import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fira_Code, Inter, Montserrat } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/app-shell/theme-provider";
import { TimezoneProvider } from "@/components/app-shell/timezone-provider";
import { TimezoneDetector } from "@/components/app-shell/timezone-detector";
import { routing } from "@/i18n/routing";
import { getSelectedTimezone, hasTimezoneCookie } from "@/lib/timezone";
import "../globals.css";

// Typographie inspirée de tesla.com (Gotham SSm est payant).
// Inter pour le body (excellente lisibilité mobile), Montserrat pour les titres
// et chiffres (descendance directe de Gotham en domaine libre).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

// Fira Code pour les valeurs numériques du design Cockpit (telemetry HUD).
// Branché sur --font-mono via @theme inline dans globals.css.
const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TeslaMateFix",
  description:
    "Outil mobile-first pour corriger et compléter les données collectées par TeslaMate (drives, charges, positions, états).",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const [timeZone, tzCookiePresent] = await Promise.all([
    getSelectedTimezone(),
    hasTimezoneCookie(),
  ]);

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${montserrat.variable} ${firaCode.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <NextIntlClientProvider timeZone={timeZone}>
          <TimezoneProvider timeZone={timeZone}>
            <ThemeProvider>
              <TooltipProvider>
                {children}
                <TimezoneDetector hasCookie={tzCookiePresent} />
                <Toaster richColors closeButton position="top-right" />
              </TooltipProvider>
            </ThemeProvider>
          </TimezoneProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
