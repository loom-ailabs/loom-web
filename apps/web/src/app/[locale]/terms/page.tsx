import { getLocale } from "@hotkey-tools/i18n/server";
import { LegalPage } from "@/_pages/legal";
import { createPageMetadata } from "@/shared/config/seo";

export async function generateMetadata() {
  return createPageMetadata("/terms", await getLocale());
}
export default async function Page() {
  return <LegalPage kind="terms" locale={await getLocale()} />;
}
