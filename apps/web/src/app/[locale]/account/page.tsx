import { getBillingPresentationMode } from "@/server/billing-presentation";
import type { Metadata } from "next";
import { getLocale } from "@loom-ai/i18n/server";
import { HomePage } from "@/_pages/home";
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getLocale()) === "en" ? "Profile · Loom AI" : "个人信息 · Loom AI",
    robots: { index: false, follow: false, noarchive: true },
    alternates: { canonical: null, languages: {} },
  };
}
export default async function Page() {
  return <HomePage view="account" billingMode={await getBillingPresentationMode()} />;
}
