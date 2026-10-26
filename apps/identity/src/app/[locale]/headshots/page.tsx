import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { isLocale } from "@loom-ai/i18n/routing";
import { getHeadshotMessages } from "@loom-ai/i18n/server";
import { HeadshotsPage } from "@/_pages/headshots";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await getHeadshotMessages(locale);
  return {
    title: messages.metaTitle,
    description: messages.metaDescription,
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{ Headshots: await getHeadshotMessages(locale) }}
    >
      <HeadshotsPage />
    </NextIntlClientProvider>
  );
}
