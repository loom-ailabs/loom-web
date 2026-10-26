import { getBillingPresentationMode } from "@/server/billing-presentation";
import { getLocale } from "@hotkey-tools/i18n/server";
import { HomePage } from "@/_pages/home";
import { createPageMetadata } from "@/shared/config/seo";

export async function generateMetadata() {
  return createPageMetadata("/", await getLocale(), await getBillingPresentationMode());
}

export default async function Page() {
  return <HomePage billingMode={await getBillingPresentationMode()} />;
}
