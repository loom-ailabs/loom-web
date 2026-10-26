import { getBillingPresentationMode } from "@/server/billing-presentation";
import { getLocale } from "@loom-ai/i18n/server";
import { HomePage } from "@/_pages/home";
import { createPageMetadata } from "@/shared/config/seo";

export async function generateMetadata() {
  return createPageMetadata("/workspace", await getLocale(), await getBillingPresentationMode());
}

export default async function Page() {
  return <HomePage view="workspace" billingMode={await getBillingPresentationMode()} />;
}
