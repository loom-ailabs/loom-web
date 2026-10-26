import { getBillingPresentationMode } from "@/server/billing-presentation";
import { getRequestConfig } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale } from "@loom-ai/i18n/routing";
import { getMessagesForLocale } from "@loom-ai/i18n/server";

export default getRequestConfig(async ({ locale }) => {
  const value = locale ?? (await rootParams.locale());
  if (!isLocale(value)) notFound();
  return {
    locale: value,
    messages: await getMessagesForLocale(value, await getBillingPresentationMode()),
    timeZone: "UTC",
  };
});
