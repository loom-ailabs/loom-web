import { isLocale } from "@loom-ai/i18n/routing";
import { getBillingPresentationMode } from "@/server/billing-presentation";
import { createLlmsIndex, publicTextHeaders, SITE_URL } from "@/shared/config/seo";
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("Not found", { status: 404 });
  return new Response(createLlmsIndex(locale, await getBillingPresentationMode()), {
    headers: {
      ...publicTextHeaders,
      "Content-Language": locale === "en" ? "en" : "zh-CN",
      Link: `<${SITE_URL}${locale === "zh" ? "/zh" : ""}/llms.txt>; rel="describedby"`,
    },
  });
}
export const dynamic = "force-dynamic";
