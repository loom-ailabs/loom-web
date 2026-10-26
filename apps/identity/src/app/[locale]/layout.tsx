import { getBillingPresentationMode } from "@/server/billing-presentation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { AppearanceProvider } from "@hotkey-tools/ui";
import { getMessagesForLocale } from "@hotkey-tools/i18n/server";
import { isLocale, languageTag } from "@hotkey-tools/i18n/routing";
import "../globals.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "en" ? "Loom AI · Account and Access" : "Loom AI · 账号与访问权限",
    description:
      locale === "en"
        ? "Sign in to Loom AI and manage your workspace access."
        : "登录 Loom AI，管理账号与工作区访问权限。",
    icons: { icon: "/loom.png", apple: "/loom.png" },
    robots: { index: false, follow: false, noarchive: true },
  };
}
export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const billingMode = await getBillingPresentationMode();
  const theme = (await cookies()).get("LOOM_THEME")?.value;
  const initialTheme =
    theme === "light" || theme === "dark" || theme === "system" ? theme : undefined;
  return (
    <html
      lang={languageTag(locale)}
      className={initialTheme === "system" ? undefined : (initialTheme ?? "dark")}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider
          locale={locale}
          messages={await getMessagesForLocale(locale, billingMode)}
          timeZone="UTC"
        >
          <AppearanceProvider initialTheme={initialTheme}>{children}</AppearanceProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
