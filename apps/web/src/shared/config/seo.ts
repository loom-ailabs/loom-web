import type { Metadata } from "next";
import { getSeoMessages } from "@loom-ai/i18n/seo";
import { languageTag, localizePath, type Locale } from "@loom-ai/i18n/routing";
import type { PaymentMode } from "@loom-ai/identity-core/billing-types";

export const SITE_URL = "https://www.loom-labs.ai";
export const SITE_NAME = "Loom AI";
export const SITE_DESCRIPTION = getSeoMessages("en").description;
export const BRAND_IMAGE = {
  url: `${SITE_URL}/loom.png`,
  width: 1254,
  height: 1254,
  alt: getSeoMessages("en").brandImageAlt,
};
const pages = [
  { path: "/", key: "home" },
  { path: "/vision", key: "vision" },
  { path: "/workspace", key: "workspace" },
  { path: "/pricing", key: "pricing" },
  { path: "/privacy", key: "privacy" },
  { path: "/terms", key: "terms" },
] as const;
export type PublicPath = (typeof pages)[number]["path"];
export function publicPagesForLocale(locale: Locale, billingMode: PaymentMode = "test") {
  const messages = getSeoMessages(locale);
  return pages.map((page) => ({
    path: page.path,
    ...messages.pages[page.key],
    ...(billingMode === "live" && page.key === "pricing"
      ? { description: messages.live.pricingDescription, content: messages.live.pricingContent }
      : {}),
  }));
}
export const PUBLIC_PAGES = publicPagesForLocale("en");
export function publicPageUrl(path: PublicPath, locale: Locale = "en"): string {
  return new URL(localizePath(path, locale), SITE_URL).href;
}
export function createPageMetadata(
  path: PublicPath,
  locale: Locale = "en",
  billingMode: PaymentMode = "test",
): Metadata {
  const page = publicPagesForLocale(locale, billingMode).find(
    (candidate) => candidate.path === path,
  )!;
  const url = publicPageUrl(path, locale);
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: {
      canonical: url,
      languages: {
        "zh-CN": publicPageUrl(path, "zh"),
        en: publicPageUrl(path, "en"),
        "x-default": publicPageUrl(path, "en"),
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "zh" ? "zh_CN" : "en_US",
      alternateLocale: locale === "zh" ? ["en_US"] : ["zh_CN"],
      siteName: SITE_NAME,
      url,
      title: page.title,
      description: page.description,
      images: [{ ...BRAND_IMAGE, alt: getSeoMessages(locale).brandImageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [{ url: BRAND_IMAGE.url, alt: getSeoMessages(locale).brandImageAlt }],
    },
  };
}
export function createSiteStructuredData(locale: Locale) {
  const description = getSeoMessages(locale).description;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: {
          "@type": "ImageObject",
          url: BRAND_IMAGE.url,
          width: BRAND_IMAGE.width,
          height: BRAND_IMAGE.height,
          caption: getSeoMessages(locale).brandImageAlt,
        },
      },
      {
        "@type": "WebSite",
        name: SITE_NAME,
        url: publicPageUrl("/", locale),
        inLanguage: languageTag(locale),
        description,
      },
    ],
  };
}
export const siteStructuredData = createSiteStructuredData("en");
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
export function createLlmsIndex(locale: Locale, billingMode: PaymentMode = "test") {
  const m = getSeoMessages(locale);
  return `# ${SITE_NAME}\n\n> ${m.description}\n\n${billingMode === "live" ? m.live.boundary : m.boundary}\n\n## ${m.publicPages}\n\n${publicPagesForLocale(
    locale,
    billingMode,
  )
    .map((page) => `- [${page.label}](${publicPageUrl(page.path, locale)}): ${page.description}`)
    .join(
      "\n",
    )}\n\n## ${m.publicText}\n\n- [${m.textLink}](${SITE_URL}${localizePath("/llms-full.txt", locale)}): ${m.textDescription}\n`;
}
export function createLlmsFullText(locale: Locale, billingMode: PaymentMode = "test") {
  const m = getSeoMessages(locale);
  const questions = m.faq.items
    .map(({ question, answer }) => `### ${question}\n\n${answer}`)
    .join("\n\n");
  return `# ${SITE_NAME} ${m.publicTitle}\n\n> ${m.privateBoundary}\n\n${publicPagesForLocale(
    locale,
    billingMode,
  )
    .map(
      (page) =>
        `## ${page.label}\n\n${m.pageLabel}: ${publicPageUrl(page.path, locale)}\n\n${page.content}`,
    )
    .join("\n\n")}\n\n## ${m.faq.title}\n\n${questions}\n`;
}
export const publicTextHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=0, must-revalidate",
  "X-Content-Type-Options": "nosniff",
  Link: `<${SITE_URL}/llms.txt>; rel="describedby"`,
};
