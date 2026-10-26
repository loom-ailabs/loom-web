import { createLlmsFullText, publicTextHeaders } from "@/shared/config/seo";
import { getBillingPresentationMode } from "@/server/billing-presentation";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(createLlmsFullText("en", await getBillingPresentationMode()), {
    headers: { ...publicTextHeaders, "Content-Language": "en" },
  });
}
