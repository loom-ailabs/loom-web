import { getBillingPresentationMode } from "@/server/billing-presentation";
import { getEnv } from "@/server/env";
import { SiteAnalytics } from "@loom-ai/analytics";
import { getAnalyticsConfiguration } from "@loom-ai/analytics/server";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { AppearanceProvider } from "@loom-ai/ui";
import { getMessagesForLocale } from "@loom-ai/i18n/server";
import { isLocale, languageTag, localizePath } from "@loom-ai/i18n/routing";
import {
  createPageMetadata,
  SITE_NAME,
  SITE_URL,
  serializeJsonLd,
  createSiteStructuredData,
} from "@/shared/config/seo";
import { ProductAccessProvider } from "@/features/product-workspace";
import "../globals.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    ...createPageMetadata("/", locale, await getBillingPresentationMode()),
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    verification: { google: "URwgNlwD6Yutc7w_L-YBUPlDlw1dFsqONwf5sMi72Cs" },
    icons: { icon: "/loom.png", apple: "/loom.png" },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
  };
}
export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const billingMode = await getBillingPresentationMode();
  const messages = await getMessagesForLocale(locale, billingMode);
  const analytics = getAnalyticsConfiguration(await getEnv(), "web");
  const theme = (await cookies()).get("LOOM_THEME")?.value;
  const initialTheme =
    theme === "light" || theme === "dark" || theme === "system" ? theme : undefined;
  return (
    <html
      lang={languageTag(locale)}
      className={initialTheme === "system" ? undefined : (initialTheme ?? "dark")}
      suppressHydrationWarning
    >
      <head>
        <link
          rel="describedby"
          type="text/plain"
          href={locale === "zh" ? "/zh/llms.txt" : "/llms.txt"}
        />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(createSiteStructuredData(locale)) }}
        />
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
          <AppearanceProvider initialTheme={initialTheme}>
            <ProductAccessProvider>{children}</ProductAccessProvider>
            <SiteAnalytics
              configuration={analytics}
              copy={messages.Common.analytics}
              privacyHref={localizePath("/privacy", locale)}
            />
          </AppearanceProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
