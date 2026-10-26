import { getLocale } from "@loom-ai/i18n/server";
import { LegalPage } from "@/_pages/legal";
import { createPageMetadata } from "@/shared/config/seo";

export async function generateMetadata() {
  return createPageMetadata("/privacy", await getLocale());
}
export default async function Page() {
  return <LegalPage kind="privacy" locale={await getLocale()} />;
}
